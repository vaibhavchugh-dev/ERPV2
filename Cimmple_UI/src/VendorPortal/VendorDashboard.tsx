import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { QuotationService, VendorQuotationMaster } from "../Common/Services/QuotationService";
import { matchAmountValue, matchDateValue } from "../Common/Utils/listSearchMatch";
import VendorQuotationResponse from "./VendorQuotationResponse";
import "./VendorPortal.scss";

const VendorDashboard: React.FC = () => {
  const [quotations, setQuotations] = useState<VendorQuotationMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number>(0);
  const [showResponseView, setShowResponseView] = useState(false);
  const [vendorCode, setVendorCode] = useState<string>("");
  const [vendorName, setVendorName] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    const vendorStorage = localStorage.getItem("vendorStorage");
    if (vendorStorage) {
      const storage = JSON.parse(vendorStorage);
      setVendorCode(storage.vendorCode || "");
      setVendorName(storage.vendorName || "");
    }
    loadQuotations();
  }, []);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      const vendorStorage = localStorage.getItem("vendorStorage");
      if (!vendorStorage) {
        toast.error("Please login to view quotations");
        return;
      }

      const storage = JSON.parse(vendorStorage);
      const vendorCode = storage.vendorCode;

      if (!vendorCode) {
        toast.error("Vendor code not found");
        return;
      }

      // Call vendor-specific API endpoint
      const result = await QuotationService.GetVendorQuotationsByVendorCode(vendorCode);

      if (result && Array.isArray(result)) {
        setQuotations(result);
      } else {
        setQuotations([]);
      }
    } catch (error: any) {
      console.error("[VendorDashboard] Error loading quotations:", error);
      toast.error(`Error loading quotations: ${error.message || "Unknown error"}`);
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("vendorToken");
    localStorage.removeItem("vendorRefreshToken");
    localStorage.removeItem("vendorStorage");
    window.location.href = "/vendor/login";
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

  const formatQuotationNumber = (number: number): string => {
    const displayNumber = number < 1000 ? number + 999 : number;
    return `VQ#${displayNumber}`;
  };

  const getStatusBadge = (status: string) => {
    if (!status || status.trim() === "") {
      return <span className="badge badge-draft">Draft</span>;
    }
    const statusLower = status.toLowerCase().trim();

    if (statusLower === "sent" || statusLower === "active") {
      return <span className="badge badge-sent">Sent</span>;
    } else if (statusLower === "responded") {
      return <span className="badge badge-accepted">Responded</span>;
    } else if (statusLower === "accepted") {
      return <span className="badge badge-accepted">Accepted</span>;
    } else if (statusLower === "rejected" || statusLower === "cancelled") {
      return <span className="badge badge-rejected">Rejected</span>;
    } else if (statusLower === "draft") {
      return <span className="badge badge-draft">Draft</span>;
    }

    return <span className="badge badge-draft">{status}</span>;
  };

  const visibleQuotations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return quotations;
    return quotations.filter((quotation) => {
      const text = [
        formatQuotationNumber(quotation.quotationNumber),
        quotation.quotationType === "Service" ? "Service" : "Material",
        quotation.status || "Draft",
        formatDate(quotation.orderDate),
      ]
        .join(" | ")
        .toLowerCase();
      return (
        text.includes(q) ||
        matchDateValue(q, quotation.orderDate) ||
        matchAmountValue(q, quotation.totalAmount)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotations, searchQuery]);

  const displayVendorName =
    vendorName || quotations.find((quotation) => quotation.vendorName)?.vendorName || "";

  const handleQuotationClick = (quotationId: number) => {
    console.log("Dashboard: Clicking on quotation ID:", quotationId);
    setSelectedQuotationId(quotationId);
    setShowResponseView(true);
  };

  const handleCloseResponse = (refreshList = false) => {
    setShowResponseView(false);
    setSelectedQuotationId(0);
    if (refreshList) {
      loadQuotations();
    }
  };

  if (loading) {
    return (
      <div className="vendor-portal-container">
        <div className="vendor-header">
          <h1>Vendor Portal</h1>
          <button onClick={handleLogout} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "0.5rem 1rem", borderRadius: "0.25rem", cursor: "pointer" }}>
            Logout
          </button>
        </div>
        <div className="vendor-content" style={{ textAlign: "center", padding: "3rem" }}>
          <p>Loading quotations...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="vendor-portal-container">
        <div className="vendor-header">
          <h1>
            Vendor Portal - {displayVendorName ? `${displayVendorName} (${vendorCode})` : vendorCode}
          </h1>
          <button onClick={handleLogout} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "0.5rem 1rem", borderRadius: "0.25rem", cursor: "pointer" }}>
            Logout
          </button>
        </div>

        <div className="vendor-content">
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ marginBottom: "0.5rem", color: "#1f2937" }}>My Quotations</h2>
            <p style={{ color: "#6b7280", margin: 0 }}>
              Click on a quotation to view details and submit your response
            </p>
          </div>

          {quotations.length > 0 && (
            <div className="vendor-search">
              <svg
                className="vendor-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                className="vendor-search-input"
                placeholder="Search quotation, date, amount, status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {visibleQuotations.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", backgroundColor: "white", borderRadius: "0.5rem" }}>
              <p style={{ color: "#6b7280", fontSize: "1.125rem" }}>No quotations found</p>
              <p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>
                {quotations.length > 0
                  ? "No quotations match your search"
                  : "Quotations sent to you will appear here"}
              </p>
            </div>
          ) : (
            <div>
              {visibleQuotations.map((quotation) => (
                <div
                  key={quotation.orderID}
                  className="vendor-quotation-card"
                  onClick={() => handleQuotationClick(quotation.orderID)}
                >
                  <div className="vendor-quotation-header">
                    <div className="vendor-quotation-info">
                      <div className="vendor-quotation-number">
                        {formatQuotationNumber(quotation.quotationNumber)}
                      </div>
                      <div className="vendor-quotation-date">
                        Date: {formatDate(quotation.orderDate)}
                      </div>
                    </div>
                    <div>{getStatusBadge(quotation.status)}</div>
                  </div>

                  <div className="vendor-quotation-details">
                    <div className="vendor-detail-item">
                      <span className="vendor-detail-label">Total Amount</span>
                      <span className="vendor-detail-value">{formatCurrency(quotation.totalAmount)}</span>
                    </div>
                    <div className="vendor-detail-item">
                      <span className="vendor-detail-label">Type</span>
                      <span className="vendor-detail-value">
                        {quotation.quotationType === "Service" ? "🔧 Service" : "📦 Material"}
                      </span>
                    </div>
                    <div className="vendor-detail-item">
                      <span className="vendor-detail-label">Status</span>
                      <span className="vendor-detail-value">{quotation.status || "Draft"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showResponseView && selectedQuotationId > 0 && (
        <VendorQuotationResponse
          quotationId={selectedQuotationId}
          onClose={handleCloseResponse}
        />
      )}
    </>
  );
};

export default VendorDashboard;

