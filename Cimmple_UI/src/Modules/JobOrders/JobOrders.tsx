import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { JobOrderService, JobOrderMaster } from "../../Common/Services/JobOrderService";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import {
  JOB_PRIORITY,
  JOB_PRIORITY_OPTIONS,
  getJobPriorityLabel,
  normalizeJobPriority,
} from "../../Common/Constants/jobPriorities";
import JobOrderSlideout from "./JobOrderSlideout";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import { formatDateOnlyFromApi } from "../../Common/Utils/Formatting";
import "./JobOrders.scss";

const JobOrders: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [jobOrders, setJobOrders] = useState<JobOrderMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState<number>(0);
  const [headerPreview, setHeaderPreview] = useState<{
    jobOrderNumber?: number;
    customerOrderId?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  useEffect(() => {
    loadJobOrders();
  }, [locationIdParam]);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get("open");
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedJobOrderId(id);
        setHeaderPreview(null);
        setShowSlideout(true);
        // Clean up URL
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  // Listen for custom event from global search
  useEffect(() => {
    const handleOpenEntity = (event: CustomEvent) => {
      if (event.detail.type === "jobOrder") {
        setSelectedJobOrderId(event.detail.id);
        setHeaderPreview(null);
        setShowSlideout(true);
      }
    };

    window.addEventListener("openEntity", handleOpenEntity as EventListener);
    return () => {
      window.removeEventListener("openEntity", handleOpenEntity as EventListener);
    };
  }, []);

  const loadJobOrders = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await JobOrderService.GetJobOrders({
        tenantid: tenantID,
        locationId: locationIdParam,
      });

      if (result && Array.isArray(result)) {
        setJobOrders(result);
      } else {
        setJobOrders([]);
      }
    } catch (error: any) {
      console.error("[JobOrders] Error loading job orders:", error);
      const apiMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Unknown error";
      toast.error(`Error loading job orders: ${apiMessage}`);
      setJobOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (row: Record<string, any>) => {
    const jobOrder = row as JobOrderMaster;
    setSelectedJobOrderId(jobOrder.jobOrderID);
    setHeaderPreview({
      jobOrderNumber: jobOrder.jobOrderNumber,
      customerOrderId: jobOrder.customerOrderID,
    });
    setShowSlideout(true);
  };

  const handleCloseSlideout = (refreshList = false) => {
    setShowSlideout(false);
    setSelectedJobOrderId(0);
    setHeaderPreview(null);
    if (refreshList) {
      loadJobOrders();
    }
  };

  const formatDate = (dateStr: string): string =>
    formatDateOnlyFromApi(dateStr, true) || dateStr;

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

  const getPriorityBadge = (priority: number) => {
    const level = normalizeJobPriority(priority);
    const label = getJobPriorityLabel(level);
    if (level === JOB_PRIORITY.Urgent) {
      return <span className="badge jo-priority-badge jo-priority-badge--urgent">{label}</span>;
    }
    if (level === JOB_PRIORITY.High) {
      return <span className="badge jo-priority-badge jo-priority-badge--high">{label}</span>;
    }
    return <span className="badge jo-priority-badge jo-priority-badge--normal">{label}</span>;
  };

  const formatJobOrderNumber = (number: number): string => {
    const displayNumber = number < 1000 ? number + 999 : number;
    return `JO#${displayNumber}`;
  };

  const formatCustomerOrderNumber = (number: number): string => {
    const displayNumber = number < 1000 ? number + 999 : number;
    return `CO#${displayNumber}`;
  };

  const toDisplayNumber = (number: number): number =>
    number > 0 && number < 1000 ? number + 999 : number;

  /** Match JO#/CO# display formats as well as raw stored ids. */
  const matchJobOrderSearch = (job: any, searchLower: string): boolean => {
    const q = searchLower.trim().toLowerCase();
    if (!q) return true;

    const joRaw = Number(job.jobOrderNumber) || 0;
    const joDisplay = toDisplayNumber(joRaw);
    const joFormatted = formatJobOrderNumber(joRaw).toLowerCase();
    const coRaw = Number(job.customerOrderID) || 0;
    const coDisplay = toDisplayNumber(coRaw);
    const coFormatted = formatCustomerOrderNumber(coRaw).toLowerCase();

    const qJo = q.replace(/^jo#?/, "").replace(/\s/g, "");
    const qCo = q.replace(/^co#?/, "").replace(/\s/g, "");

    const hay = [
      joFormatted,
      String(joRaw),
      String(joDisplay),
      coFormatted,
      String(coRaw),
      String(coDisplay),
      job.customerName,
      job.partNo,
      job.partName,
      job.jobNumber,
      job.jobDesc,
      job.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      hay.includes(q) ||
      (!!qJo &&
        (String(joRaw).includes(qJo) ||
          String(joDisplay).includes(qJo) ||
          joFormatted.includes(qJo))) ||
      (!!qCo &&
        (String(coRaw).includes(qCo) ||
          String(coDisplay).includes(qCo) ||
          coFormatted.includes(qCo)))
    );
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
      key: "jobPriority",
      label: "Priority",
      sortable: true,
      render: (value: any) => getPriorityBadge(Number(value) || 0),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value: any) => getStatusBadge(value),
    },
  ];

  const filteredJobOrders = useMemo(() => {
    const filtered = jobOrders.filter((jobOrder) => {
      if (statusFilter !== "all" && jobOrder.status !== statusFilter) {
        return false;
      }
      if (priorityFilter !== "all") {
        const selected = parseInt(priorityFilter, 10);
        if (normalizeJobPriority(jobOrder.jobPriority) !== selected) {
          return false;
        }
      }
      return true;
    });

    // Default order: Urgent → High → Normal, then earlier due date
    return [...filtered].sort((a, b) => {
      const priorityDiff =
        normalizeJobPriority(b.jobPriority) - normalizeJobPriority(a.jobPriority);
      if (priorityDiff !== 0) return priorityDiff;
      const aDue = a.dueDate || "";
      const bDue = b.dueDate || "";
      return aDue.localeCompare(bDue);
    });
  }, [jobOrders, statusFilter, priorityFilter]);

  return (
    <div className="job-orders">
      <MasterListPage
        title="Job Orders"
        columns={columns}
        data={filteredJobOrders}
        loading={loading}
        enablePagination
        matchRowSearch={matchJobOrderSearch}
        onAdd={() => {
          toast.info("Create job orders from Customer Order line items");
        }}
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
              { value: "Completed", label: "Completed" },
              { value: "Cancelled", label: "Cancelled" },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
          {
            label: "Priority",
            options: [
              { value: "all", label: "All" },
              ...JOB_PRIORITY_OPTIONS.map((opt) => ({
                value: String(opt.value),
                label: opt.label,
              })),
            ],
            value: priorityFilter,
            onChange: setPriorityFilter,
          },
        ]}
        searchPlaceholder="Search job orders..."
        getRowId={(row) => (row as JobOrderMaster).jobOrderID}
      />

      {showSlideout && (
        <JobOrderSlideout
          jobOrderId={selectedJobOrderId}
          headerPreview={headerPreview || undefined}
          onClose={handleCloseSlideout}
          onSaved={loadJobOrders}
        />
      )}
    </div>
  );
};

export default JobOrders;
