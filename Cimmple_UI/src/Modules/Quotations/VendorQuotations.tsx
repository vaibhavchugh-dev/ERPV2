import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { QuotationService, VendorQuotationMaster } from "../../Common/Services/QuotationService";
import VendorQuotationSlideout from "./VendorQuotationSlideout";
import VendorQuotationComparison from "./VendorQuotationComparison";
import VendorOrderSlideout from "../Purchasing/VendorOrderSlideout";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import { matchDisplayDocNumber } from "../../Common/Utils/displayDocNumberSearch";
import { matchAmountValue, matchDateValue } from "../../Common/Utils/listSearchMatch";
import { usePagePermissions } from "../../Common/Hooks/usePagePermissions";
import "./VendorQuotations.scss";

const PAGE_PATH = "/quotations/vendor";

const VendorQuotations: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const { formatCurrency, formatDate } = useFormatting();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const { ensure, can } = usePagePermissions(PAGE_PATH);
  const canCompare = can("Compare");
  const [quotations, setQuotations] = useState<VendorQuotationMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number>(0);
  const [showOrderSlideout, setShowOrderSlideout] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonParentId, setComparisonParentId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedQuotationId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  useEffect(() => {
    loadQuotations();
  }, [locationIdParam]);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await QuotationService.GetVendorQuotations({
        tenantid: tenantID,
        locationId: locationIdParam,
      });

      if (result && Array.isArray(result)) {
        console.log("[VendorQuotations] Loaded quotations:", result.map(q => ({
          orderID: q.orderID,
          quotationNumber: q.quotationNumber,
          status: q.status,
          convertedOrderId: q.convertedOrderId
        })));
        setQuotations(result);
      } else {
        console.log("[VendorQuotations] No quotations loaded");
        setQuotations([]);
      }
    } catch (error: any) {
      console.error("[VendorQuotations] Error loading quotations:", error);
      toast.error(`Error loading quotations: ${error.message || "Unknown error"}`);
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (row: Record<string, any>) => {
    const quotation = row as VendorQuotationMaster;
    console.log("[VendorQuotations] Row clicked:", {
      orderID: quotation.orderID,
      quotationNumber: quotation.quotationNumber,
      status: quotation.status
    });
    setSelectedQuotationId(quotation.orderID);
    setShowSlideout(true);
  };

  const handleAddQuotation = () => {
    if (!ensure("Add")) return;
    setSelectedQuotationId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = (refreshList = false) => {
    setShowSlideout(false);
    setSelectedQuotationId(0);
    if (refreshList) {
      loadQuotations();
    }
  };

  const getStatusBadge = (status: string) => {
    if (!status || status.trim() === "") {
      return <span className="badge badge-secondary">-</span>;
    }
    const statusLower = status.toLowerCase().trim();

    if (statusLower === "partially converted") {
      return <span className="badge badge-info">Partially Converted</span>;
    }
    if (statusLower === "converted" || statusLower === "convrted") {
      return <span className="badge badge-primary">Converted</span>;
    }
    if (statusLower.includes("convert")) {
      return <span className="badge badge-primary">{status}</span>;
    }

    if (statusLower === "draft") {
      return <span className="badge badge-warning">Draft</span>;
    } else if (statusLower === "sent" || statusLower === "active") {
      return <span className="badge badge-success">Sent</span>;
    } else if (statusLower === "responded") {
      return <span className="badge badge-info">Responded</span>;
    } else if (statusLower === "accepted") {
      return <span className="badge badge-info">Accepted</span>;
    } else if (statusLower === "rejected" || statusLower === "cancelled") {
      return <span className="badge badge-danger">Rejected</span>;
    }

    return <span className="badge badge-secondary">{status}</span>;
  };

  const formatQuotationNumber = (number: number): string => {
    const displayNumber = number < 1000 ? number + 999 : number;
    return `VQ#${displayNumber}`;
  };

  const getQuotationTypeBadge = (type: string) => {
    if (!type || type.trim() === "") {
      return <span style={{ color: "#9ca3af" }}>-</span>;
    }
    const typeLower = type.toLowerCase().trim();
    
    if (typeLower === "material") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <span>ðŸ“¦</span>
          <span>Material</span>
        </span>
      );
    } else if (typeLower === "service") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <span>ðŸ”§</span>
          <span>Service</span>
        </span>
      );
    } else if (typeLower === "mixed") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <span>ðŸ“¦</span>
          <span>Mixed</span>
        </span>
      );
    }
    
    return <span>{type}</span>;
  };

  const columns = [
    {
      key: "quotationNumber",
      label: "Quotation No",
      sortable: true,
      align: "left" as const,
      render: (value: any) => <span className="entity-number">{formatQuotationNumber(value)}</span>,
    },
    {
      key: "vendorName",
      label: "Vendor Name",
      sortable: true,
      align: "left" as const,
    },
    {
      key: "quotationType",
      label: "Category",
      sortable: true,
      align: "center" as const,
      render: (value: any) => getQuotationTypeBadge(value),
    },
    {
      key: "orderDate",
      label: "Quotation Date",
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
    {
      key: "convertedOrderId",
      label: "Order #",
      sortable: false,
      align: "left" as const,
      render: (_value: any, row: any) => {
        const quotation = row as VendorQuotationMaster;
        const orders =
          quotation.convertedOrders && quotation.convertedOrders.length > 0
            ? quotation.convertedOrders
            : quotation.convertedOrderNumber || quotation.convertedOrderId
              ? [
                  {
                    orderId: quotation.convertedOrderOrderId || 0,
                    poNumber: Number(
                      quotation.convertedOrderNumber ?? quotation.convertedOrderId
                    ),
                    displayNumber: (() => {
                      const n = Number(
                        quotation.convertedOrderNumber ?? quotation.convertedOrderId
                      );
                      return n < 1000 ? n + 999 : n;
                    })(),
                  },
                ]
              : [];

        if (orders.length === 0) {
          return <span style={{ color: "#9ca3af" }}>-</span>;
        }

        return (
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {orders.map((o) => (
              <span
                key={`${o.orderId}-${o.poNumber}`}
                style={{
                  color: "#10b981",
                  textDecoration: o.orderId ? "underline" : "none",
                  cursor: o.orderId ? "pointer" : "default",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (o.orderId) {
                    setSelectedOrderId(o.orderId);
                    setShowOrderSlideout(true);
                  }
                }}
                title={o.orderId ? "Click to view order" : undefined}
              >
                VO#{o.displayNumber || o.poNumber}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      align: "center" as const,
      render: (_value: any, row: any) => {
        const quotation = row as VendorQuotationMaster;

        // Hide Compare when all master RFQ lines are on VOs (any vendor mix).
        if (
          quotation.anyVendorFullyConverted === true ||
          quotation.allLinesConverted === true ||
          quotation.allMasterLinesCovered === true ||
          quotation.isConverted > 0
        ) {
          return <span style={{ color: "#9ca3af" }}>-</span>;
        }

        const parentId = quotation.orderID;
        const isMultiVendorMaster =
          quotation.hasChildQuotations === true ||
          quotation.parentQuotationID === quotation.orderID;

        if (!isMultiVendorMaster) {
          return <span style={{ color: "#9ca3af" }}>-</span>;
        }

        if (!canCompare) {
          return <span style={{ color: "#9ca3af" }}>-</span>;
        }

        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!ensure("Compare")) return;
              setComparisonParentId(parentId);
              setShowComparison(true);
            }}
            style={{
              padding: "0.375rem 0.75rem",
              backgroundColor: "#6366f1",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#4f46e5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#6366f1";
            }}
          >
            Compare
          </button>
        );
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
    <div className="vendor-quotations">
      <MasterListPage
        permissionPath="/quotations/vendor"
        title="Vendor Quotations"
        columns={columns}
        data={filteredQuotations}
        loading={loading}
        enablePagination
        onAdd={handleAddQuotation}
        onRowClick={handleRowClick}
        filters={[
          masterListFilter,
          {
            label: "Status",
            options: [
              { value: "all", label: "All Statuses" },
              { value: "Draft", label: "Draft" },
              { value: "Sent", label: "Sent" },
              { value: "Responded", label: "Responded" },
              { value: "Accepted", label: "Accepted" },
              { value: "Rejected", label: "Rejected" },
              { value: "Partially Converted", label: "Partially Converted" },
              { value: "Converted", label: "Converted" },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        searchPlaceholder="Search quotations..."
        matchRowSearch={(row, q) => {
          const quotation = row as VendorQuotationMaster;
          const num = Number(quotation.quotationNumber ?? 0);
          if (matchDisplayDocNumber(q, num, ["vq#", "vq"])) return true;
          const convertedNum = Number(quotation.convertedOrderNumber ?? 0);
          if (convertedNum > 0 && matchDisplayDocNumber(q, convertedNum, ["vo#", "vo"])) return true;
          if (matchAmountValue(q, quotation.totalAmount)) return true;
          if (matchDateValue(q, quotation.orderDate)) return true;
          const hay = [quotation.vendorName, quotation.vendorCode, quotation.status]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        }}
        getRowId={(row) => (row as VendorQuotationMaster).orderID}
      />

      {showSlideout && (
        <VendorQuotationSlideout
          quotationId={selectedQuotationId}
          onClose={handleCloseSlideout}
          onSaved={(id) => setSelectedQuotationId(id)}
        />
      )}

      {showOrderSlideout && (
        <VendorOrderSlideout
          orderId={selectedOrderId}
          onClose={(refreshList = false) => {
            setShowOrderSlideout(false);
            setSelectedOrderId(0);
            if (refreshList) {
              loadQuotations();
            }
          }}
        />
      )}

      {showComparison && (
        <VendorQuotationComparison
          parentQuotationId={comparisonParentId}
          onClose={(refreshList = false) => {
            setShowComparison(false);
            setComparisonParentId(0);
            if (refreshList) {
              loadQuotations();
            }
          }}
          onQuotationSelected={(quotationId) => {
            // Optionally open the selected quotation
            setSelectedQuotationId(quotationId);
            setShowComparison(false);
            setShowSlideout(true);
          }}
        />
      )}
    </div>
  );
};

export default VendorQuotations;
