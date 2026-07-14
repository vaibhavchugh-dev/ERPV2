import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { JobOrderService, JobOrderMaster } from "../../Common/Services/JobOrderService";
import JobOrderSlideout from "./JobOrderSlideout";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import "./JobOrders.scss";

const JobOrders: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [jobOrders, setJobOrders] = useState<JobOrderMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadJobOrders();
  }, []);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedJobOrderId(id);
        setShowSlideout(true);
        // Clean up URL
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  // Listen for custom event from global search
  useEffect(() => {
    const handleOpenEntity = (event: CustomEvent) => {
      if (event.detail.type === 'jobOrder') {
        setSelectedJobOrderId(event.detail.id);
        setShowSlideout(true);
      }
    };

    window.addEventListener('openEntity', handleOpenEntity as EventListener);
    return () => {
      window.removeEventListener('openEntity', handleOpenEntity as EventListener);
    };
  }, []);

  const loadJobOrders = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await JobOrderService.GetJobOrders({ tenantid: tenantID });
      
      if (result && Array.isArray(result)) {
        setJobOrders(result);
      } else {
        setJobOrders([]);
      }
    } catch (error: any) {
      console.error("[JobOrders] Error loading job orders:", error);
      toast.error(`Error loading job orders: ${error.message || "Unknown error"}`);
      setJobOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (row: Record<string, any>) => {
    const jobOrder = row as JobOrderMaster;
    setSelectedJobOrderId(jobOrder.jobOrderID);
    setShowSlideout(true);
  };

  const handleCloseSlideout = () => {
    setShowSlideout(false);
    setSelectedJobOrderId(0);
    loadJobOrders();
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
    
    return <span className="badge badge-secondary">{status}</span>;
  };

  const formatJobOrderNumber = (number: number): string => {
    const displayNumber = number < 1000 ? number + 999 : number;
    return `JO#${displayNumber}`;
  };

  const formatCustomerOrderNumber = (number: number): string => {
    const displayNumber = number < 1000 ? number + 999 : number;
    return `CO#${displayNumber}`;
  };

  const columns = [
    {
      key: "jobOrderNumber",
      label: "Job Order #",
      sortable: true,
      render: (value: any) => formatJobOrderNumber(value),
    },
    {
      key: "customerOrderID",
      label: "Customer Order #",
      sortable: true,
      render: (value: any, row: any) => {
        if (value) {
          return (
            <span
              style={{
                color: "#6366f1",
                fontWeight: 500,
                cursor: "pointer",
                textDecoration: "underline",
              }}
              onClick={(e) => {
                e.stopPropagation();
                // Navigate to customer order - you can implement navigation here
                window.location.href = `/orders/customer?orderId=${value}`;
              }}
              title="Click to view customer order"
            >
              {formatCustomerOrderNumber(value)}
            </span>
          );
        }
        return "-";
      },
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
    },
    {
      key: "partNo",
      label: "Part No",
      sortable: true,
    },
    {
      key: "partName",
      label: "Part Name",
      sortable: true,
    },
    {
      key: "qtyOrdered",
      label: "Qty",
      sortable: true,
      render: (value: any, row: any) => `${value} ${row.unit || ""}`,
    },
    {
      key: "dueDate",
      label: "Due Date",
      sortable: true,
      render: (value: any) => formatDate(value),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value: any) => getStatusBadge(value),
    },
  ];

  const filteredJobOrders = jobOrders.filter((jobOrder) => {
    if (statusFilter !== "all" && jobOrder.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="job-orders">
      <MasterListPage
        title="Job Orders"
        columns={columns}
        data={filteredJobOrders}
        loading={loading}
        onAdd={() => {
          toast.info("Create job orders from Customer Order line items");
        }}
        onRowClick={handleRowClick}
        filters={[
          {
            label: "Status",
            options: [
              { value: "all", label: "All" },
              { value: "Draft", label: "Draft" },
              { value: "In Progress", label: "In Progress" },
              { value: "Partially Shipped", label: "Partially Shipped" },
              { value: "Shipped", label: "Shipped" },
              { value: "Completed", label: "Completed" },
              { value: "Cancelled", label: "Cancelled" },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        searchPlaceholder="Search job orders..."
        getRowId={(row) => (row as JobOrderMaster).jobOrderID}
      />

      {showSlideout && (
        <JobOrderSlideout
          jobOrderId={selectedJobOrderId}
          onClose={handleCloseSlideout}
        />
      )}
    </div>
  );
};

export default JobOrders;


