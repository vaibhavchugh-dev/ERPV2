import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  ProductMasterService,
  ProductMasterDetail,
  CustomerInfo,
} from "../../Common/Services/ProductMasterService";
import CustomerOrderSlideout from "../Orders/CustomerOrderSlideout";
import CustomerQuotationSlideout from "../Quotations/CustomerQuotationSlideout";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import "./CustomerMasterSlideout.scss";

interface ProductMasterSlideoutProps {
  partNo: string;
  onClose: (refreshList?: boolean) => void;
}

const ProductMasterSlideout: React.FC<ProductMasterSlideoutProps> = ({
  partNo,
  onClose,
}) => {
  const { formatCurrency: formatCurrencyRaw, formatDate } = useFormatting();
  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return "N/A";
    return formatCurrencyRaw(value);
  };
  const handleDismiss = () => onClose(false);
  const [productData, setProductData] = useState<ProductMasterDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOrderSlideout, setShowOrderSlideout] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);
  const [showQuotationSlideout, setShowQuotationSlideout] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number>(0);

  useEffect(() => {
    if (partNo) {
      loadProduct();
    }
  }, [partNo]);

  const loadProduct = async () => {
    setLoading(true);
    try {
      const product = await ProductMasterService.GetProductById(partNo);
      if (product) {
        setProductData(product);
      } else {
        toast.error("Product not found");
        onClose();
      }
    } catch (error: any) {
      console.error("Error loading product:", error);
      toast.error(`Error loading product: ${error.message || "Unknown error"}`);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="slideout-overlay">
        <div className="form-card">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!productData) {
    return null;
  }

  return (
    <div className="slideout-overlay" onClick={handleDismiss}>
      <div className="form-card" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>Product Details</h2>
          <button type="button" className="btn-close" onClick={handleDismiss}>
            ×
          </button>
        </div>

        <div className="airframe-form">
          <div className="tab-content">
            {/* First Row: Part Number and Description */}
            <div className="form-row">
              <div className="form-group">
                <label>Part Number</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    value={productData.partNo || ""}
                    readOnly
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    value={productData.partName || ""}
                    placeholder="Part Name"
                    readOnly
                  />
                </div>
              </div>
            </div>

            {/* Second Row: Unit, Avg Price, Min Price, Max Price (4 columns) */}
            <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label>Unit</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="2" x2="12" y2="6"></line>
                        <line x1="12" y1="18" x2="12" y2="22"></line>
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                        <line x1="2" y1="12" x2="6" y2="12"></line>
                        <line x1="18" y1="12" x2="22" y2="12"></line>
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    value={productData.unit || ""}
                    readOnly
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Avg Price</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    value={formatCurrency(productData.unitPrice || productData.avgUnitPrice)}
                    readOnly
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Min Price</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    value={productData.minUnitPrice !== undefined && productData.minUnitPrice !== null ? formatCurrency(productData.minUnitPrice) : "N/A"}
                    readOnly
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Max Price</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    value={productData.maxUnitPrice !== undefined && productData.maxUnitPrice !== null ? formatCurrency(productData.maxUnitPrice) : "N/A"}
                    readOnly
                  />
                </div>
              </div>
            </div>

            {/* Additional Description from ProductMaster if available */}
            {productData.description && productData.description.trim() !== "" && (
              <div className="form-group">
                <label>Additional Description</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                      </svg>
                    </span>
                  </div>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={productData.description || ""}
                    readOnly
                  />
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Data Source</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    value={productData.source === "ProductMaster" ? "Product Master" : productData.source === "Quotations" ? "Quotations" : "Customer Orders"}
                    readOnly
                  />
                </div>
              </div>
              {productData.productId && (
                <div className="form-group">
                  <label>Product ID</label>
                  <div className="input-group">
                    <div className="input-group-prepend">
                      <span className="input-group-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 7h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2z"></path>
                        </svg>
                      </span>
                    </div>
                    <input
                      type="text"
                      className="form-input"
                      value={productData.productId || ""}
                      readOnly
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Customer Details Section */}
            {productData.customers && productData.customers.length > 0 && (
              <div className="form-group" style={{ marginTop: "2rem" }}>
                <label style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem", display: "block" }}>
                  Customers Who Ordered This Part
                </label>
                <div style={{ 
                  border: "1px solid #e5e7eb", 
                  borderRadius: "0.5rem", 
                  overflow: "hidden",
                  maxHeight: "400px",
                  overflowY: "auto"
                }}>
                  {productData.customers.map((customer: CustomerInfo, index: number) => (
                    <div 
                      key={customer.customerId} 
                      style={{ 
                        padding: "1rem", 
                        borderBottom: index < productData.customers!.length - 1 ? "1px solid #e5e7eb" : "none",
                        backgroundColor: index % 2 === 0 ? "#ffffff" : "#f9fafb"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "#111827", marginBottom: "0.25rem" }}>
                            {customer.customerName}
                          </div>
                          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                            Code: {customer.customerCode}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                            Total Qty: <span style={{ fontWeight: 600, color: "#111827" }}>{customer.totalQty.toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                            Avg Price: <span style={{ fontWeight: 600, color: "#111827" }}>{formatCurrency(customer.avgPrice)}</span>
                          </div>
                        </div>
                      </div>
                      
                      {customer.orders && customer.orders.length > 0 && (
                        <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e5e7eb" }}>
                          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>
                            Orders ({customer.orderCount || customer.orders.length}):
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {customer.orders.map((order, orderIndex) => (
                              <div 
                                key={orderIndex}
                                style={{ 
                                  display: "flex", 
                                  justifyContent: "space-between", 
                                  fontSize: "0.8125rem",
                                  padding: "0.5rem",
                                  backgroundColor: "#ffffff",
                                  borderRadius: "0.25rem",
                                  border: "1px solid #e5e7eb"
                                }}
                              >
                                <div>
                                  <a
                                    href="#"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      setSelectedOrderId(order.orderId);
                                      setShowOrderSlideout(true);
                                    }}
                                    style={{
                                      fontWeight: 500,
                                      color: "#6366f1",
                                      textDecoration: "underline",
                                      cursor: "pointer",
                                      marginRight: "0.5rem"
                                    }}
                                  >
                                    CO#{order.orderNumber < 1000 ? order.orderNumber + 999 : order.orderNumber}
                                  </a>
                                  <span style={{ color: "#6b7280" }}>
                                    {formatDate(order.orderDate)}
                                  </span>
                                </div>
                                <div style={{ color: "#6b7280" }}>
                                  Qty: {order.qty.toLocaleString()} @ {formatCurrency(order.price)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {customer.quotations && customer.quotations.length > 0 && (
                        <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e5e7eb" }}>
                          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>
                            Quotations ({customer.quotationCount || customer.quotations.length}):
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {customer.quotations.map((quotation, quotIndex) => (
                              <div 
                                key={quotIndex}
                                style={{ 
                                  display: "flex", 
                                  justifyContent: "space-between", 
                                  fontSize: "0.8125rem",
                                  padding: "0.5rem",
                                  backgroundColor: "#ffffff",
                                  borderRadius: "0.25rem",
                                  border: "1px solid #e5e7eb"
                                }}
                              >
                                <div>
                                  <a
                                    href="#"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      setSelectedQuotationId(quotation.orderId);
                                      setShowQuotationSlideout(true);
                                    }}
                                    style={{
                                      fontWeight: 500,
                                      color: "#6366f1",
                                      textDecoration: "underline",
                                      cursor: "pointer",
                                      marginRight: "0.5rem"
                                    }}
                                  >
                                    Quotation #{quotation.orderNumber < 1000 ? quotation.orderNumber + 999 : quotation.orderNumber}
                                  </a>
                                  <span style={{ color: "#6b7280" }}>
                                    {formatDate(quotation.orderDate)}
                                  </span>
                                </div>
                                <div style={{ color: "#6b7280" }}>
                                  Qty: {quotation.qty.toLocaleString()} @ {formatCurrency(quotation.price)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="form-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-cancel" onClick={handleDismiss}>
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Nested Order Slideout */}
      {showOrderSlideout && (
        <CustomerOrderSlideout
          orderId={selectedOrderId}
          onClose={() => {
            setShowOrderSlideout(false);
            setSelectedOrderId(0);
          }}
        />
      )}

      {/* Nested Quotation Slideout */}
      {showQuotationSlideout && (
        <CustomerQuotationSlideout
          quotationId={selectedQuotationId}
          onClose={() => {
            setShowQuotationSlideout(false);
            setSelectedQuotationId(0);
          }}
        />
      )}
    </div>
  );
};

export default ProductMasterSlideout;

