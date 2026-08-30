import React, { useState, useEffect } from "react";
import { NavLink, useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { QuotationService, VendorQuotationMaster } from "../../Common/Services/QuotationService";
import VendorQuotationSlideout from "./VendorQuotationSlideout";
import VendorQuotationComparison from "./VendorQuotationComparison";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import "./VendorQuotations.scss";

const VendorQuotations: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const { formatCurrency, formatDate } = useFormatting();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [quotations, setQuotations] = useState<VendorQuotationMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number>(0);
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

    if (statusLower === "converted" || statusLower === "convrted" || statusLower.includes("convert")) {
      return <span className="badge badge-primary">Converted</span>;
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
    } else if (typeLower === "mixed") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <span>📦</span>
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
      render: (value: any) => formatQuotationNumber(value),
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
      render: (value: any) => {
        if (value) {
          const orderNum = value < 1000 ? value + 999 : value;
          return (
            <NavLink
              to={`/purchasing/vendor-orders`}
              style={{
                color: "#6366f1",
                textDecoration: "none",
                fontWeight: 500,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              VO#{orderNum}
            </NavLink>
          );
        }
        return <span style={{ color: "#9ca3af" }}>-</span>;
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      align: "center" as const,
      render: (value: any, row: any) => {
        const quotation = row as VendorQuotationMaster;

        // Helper function to check if a quotation is converted
        const isQuotationConverted = (q: VendorQuotationMaster): boolean => {
          const statusLower = q.status?.toLowerCase().trim() || "";
          return (
            statusLower.includes("convert") ||
            q.isConverted > 0 ||
            (q.convertedOrderId !== null && q.convertedOrderId !== undefined && q.convertedOrderId > 0)
          );
        };

        // Don't show compare button if this quotation is converted
        if (isQuotationConverted(quotation)) {
          return <span style={{ color: "#9ca3af" }}>-</span>;
        }

        // Determine the parent ID for comparison
        // If this quotation has a parent, use that parent ID
        // If this is a master quotation, use its own orderID
        const parentId = quotation.parentQuotationID || quotation.orderID;

        // Show Compare button if:
        // 1. Quotation is not converted (already checked above)
        // 2. ParentQuotationID === orderID (master quotation used for multi-vendor - has children)
        // 
        // Note: Children are filtered from listing (IsResponseOnly = true), so we can't check
        // the quotations array. Instead, we check if ParentQuotationID === orderID, which
        // indicates the backend marked it as a master with children.
        const isMultiVendorMaster = quotation.parentQuotationID === quotation.orderID;
        
        if (!isMultiVendorMaster) {
          // Not a multi-vendor master quotation - no Compare button
          return <span style={{ color: "#9ca3af" }}>-</span>;
        }

        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
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
              { value: "all", label: "All" },
              { value: "Draft", label: "Draft" },
              { value: "Sent", label: "Sent" },
              { value: "Responded", label: "Responded" },
              { value: "Accepted", label: "Accepted" },
              { value: "Rejected", label: "Rejected" },
              { value: "Converted", label: "Converted" },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        searchPlaceholder="Search quotations..."
        getRowId={(row) => (row as VendorQuotationMaster).orderID}
      />

      {showSlideout && (
        <VendorQuotationSlideout
          quotationId={selectedQuotationId}
          onClose={handleCloseSlideout}
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
