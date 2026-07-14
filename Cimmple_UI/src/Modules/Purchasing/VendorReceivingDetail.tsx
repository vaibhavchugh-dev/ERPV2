import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import {
  VendorReceivingService,
  OrderForReceivingDetail,
  OrderDetailForReceiving,
} from "../../Common/Services/VendorReceivingService";
import { LocationService, LocationMaster } from "../../Common/Services/LocationService";
import "./VendorReceivingDetail.scss";

interface VendorReceivingDetailProps {
  orderId: number;
  onClose: () => void;
}

interface ReceivingFormData {
  orderDetailId: number;
  receivedQty: number;
  receivedDate: string;
  locationId?: number;
  notes: string;
}

const VendorReceivingDetail: React.FC<VendorReceivingDetailProps> = ({
  orderId,
  onClose,
}) => {
  const [order, setOrder] = useState<OrderForReceivingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [receivingForms, setReceivingForms] = useState<Map<number, ReceivingFormData>>(new Map());
  const [showReceivingForm, setShowReceivingForm] = useState<Map<number, boolean>>(new Map());

  useEffect(() => {
    loadOrder();
    loadLocations();
  }, [orderId]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const result = await VendorReceivingService.GetOrderForReceiving(orderId);
      if (result) {
        setOrder(result);
      }
    } catch (error: any) {
      console.error("[VendorReceivingDetail] Error loading order:", error);
      toast.error(`Error loading order: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const loadLocations = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await LocationService.GetLocations({ tenantid: tenantID });
      if (result && Array.isArray(result)) {
        setLocations(result);
      }
    } catch (error: any) {
      console.error("Error loading locations:", error);
    }
  };

  const handleReceiveItem = (detail: OrderDetailForReceiving) => {
    if (detail.pendingQty <= 0) {
      toast.warning("This item is already fully received");
      return;
    }

    const formData: ReceivingFormData = {
      orderDetailId: detail.id,
      receivedQty: detail.pendingQty,
      receivedDate: new Date().toISOString().split('T')[0],
      locationId: order?.locationId,
      notes: "",
    };

    setReceivingForms(prev => {
      const newMap = new Map(prev);
      newMap.set(detail.id, formData);
      return newMap;
    });

    setShowReceivingForm(prev => {
      const newMap = new Map(prev);
      newMap.set(detail.id, true);
      return newMap;
    });
  };

  const handleCancelReceiving = (detailId: number) => {
    setShowReceivingForm(prev => {
      const newMap = new Map(prev);
      newMap.set(detailId, false);
      return newMap;
    });
    setReceivingForms(prev => {
      const newMap = new Map(prev);
      newMap.delete(detailId);
      return newMap;
    });
  };

  const handleSubmitReceiving = async (detail: OrderDetailForReceiving) => {
    const formData = receivingForms.get(detail.id);
    if (!formData) return;

    if (formData.receivedQty <= 0) {
      toast.error("Received quantity must be greater than 0");
      return;
    }

    if (formData.receivedQty > detail.pendingQty) {
      toast.error(`Cannot receive more than ${detail.pendingQty}. Pending quantity: ${detail.pendingQty}`);
      return;
    }

    setReceiving(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;

      const result = await VendorReceivingService.ReceiveLineItem({
        orderDetailId: formData.orderDetailId,
        receivedQty: formData.receivedQty,
        receivedDate: formData.receivedDate,
        locationId: formData.locationId,
        notes: formData.notes,
        tenantid: tenantID,
      });

      if (result.success) {
        toast.success(result.message || "Items received successfully");
        handleCancelReceiving(detail.id);
        loadOrder(); // Reload to get updated quantities
      } else {
        toast.error(result.message || "Failed to receive items");
      }
    } catch (error: any) {
      console.error("[VendorReceivingDetail] Error receiving items:", error);
      toast.error(`Error receiving items: ${error.response?.data?.error || error.message || "Unknown error"}`);
    } finally {
      setReceiving(false);
    }
  };

  const handleBatchReceive = async () => {
    const formsToSubmit = Array.from(receivingForms.entries()).filter(([detailId, formData]) => {
      const detail = order?.details.find(d => d.id === detailId);
      return detail && formData.receivedQty > 0 && formData.receivedQty <= (detail.pendingQty || 0);
    });

    if (formsToSubmit.length === 0) {
      toast.warning("No valid receiving entries to submit");
      return;
    }

    setReceiving(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;

      // Submit all receiving transactions
      const results = await Promise.all(
        formsToSubmit.map(([detailId, formData]) =>
          VendorReceivingService.ReceiveLineItem({
            orderDetailId: formData.orderDetailId,
            receivedQty: formData.receivedQty,
            receivedDate: formData.receivedDate,
            locationId: formData.locationId,
            notes: formData.notes,
            tenantid: tenantID,
          })
        )
      );

      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        toast.success(`Successfully received ${formsToSubmit.length} item(s)`);
        setReceivingForms(new Map());
        setShowReceivingForm(new Map());
        loadOrder();
      } else {
        toast.error(`${failed.length} of ${formsToSubmit.length} receiving transactions failed`);
      }
    } catch (error: any) {
      console.error("[VendorReceivingDetail] Error in batch receive:", error);
      toast.error(`Error receiving items: ${error.message || "Unknown error"}`);
    } finally {
      setReceiving(false);
    }
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

  const getStatusBadge = (status: string) => {
    if (status === "Complete") {
      return <span className="badge badge-success">Complete</span>;
    } else if (status === "Partial") {
      return <span className="badge badge-info">Partial</span>;
    }
    return <span className="badge badge-secondary">Pending</span>;
  };

  if (loading) {
    return createPortal(
      <div className="slideout-overlay" onClick={onClose}>
        <div className="form-card" onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <div className="spinner"></div>
            <p>Loading order details...</p>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (!order) {
    return createPortal(
      <div className="slideout-overlay" onClick={onClose}>
        <div className="form-card" onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <p>Order not found</p>
            <button className="btn-submit" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const hasPendingReceiving = Array.from(receivingForms.values()).some(f => f.receivedQty > 0);

  return createPortal(
    <div className="slideout-overlay" onClick={onClose}>
      <div className="receiving-detail-card" onClick={(e) => e.stopPropagation()}>
        <div className="receiving-header">
          <div>
            <h2>Receive Items - PO #{order.orderNumber}</h2>
            <p style={{ margin: "0.5rem 0 0 0", color: "#6b7280" }}>
              {order.vendorName} • Order Date: {formatDate(order.orderDate)}
            </p>
          </div>
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="receiving-content">
          <div className="receiving-summary">
            <div className="summary-item">
              <span className="summary-label">Total Items:</span>
              <span className="summary-value">{order.details.length}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total Ordered:</span>
              <span className="summary-value">
                {order.details.reduce((sum, d) => sum + d.qtyOrdered, 0)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total Received:</span>
              <span className="summary-value">
                {order.details.reduce((sum, d) => sum + d.receivedQty, 0)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total Pending:</span>
              <span className="summary-value" style={{ color: "#dc3545", fontWeight: "bold" }}>
                {order.details.reduce((sum, d) => sum + d.pendingQty, 0)}
              </span>
            </div>
          </div>

          {hasPendingReceiving && (
            <div className="batch-receive-bar">
              <span>{receivingForms.size} item(s) ready to receive</span>
              <button
                className="btn-submit"
                onClick={handleBatchReceive}
                disabled={receiving}
              >
                {receiving ? "Processing..." : "Receive All"}
              </button>
            </div>
          )}

          <div className="receiving-table-wrapper">
            <table className="receiving-table">
              <thead>
                <tr>
                  <th>Item #</th>
                  <th>Part Name</th>
                  <th>Part No</th>
                  <th>Qty Ordered</th>
                  <th>Qty Received</th>
                  <th>Qty Pending</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {order.details.map((detail) => {
                  const isReceiving = showReceivingForm.get(detail.id);
                  const formData = receivingForms.get(detail.id);

                  return (
                    <React.Fragment key={detail.id}>
                      <tr className={detail.pendingQty > 0 ? "has-pending" : ""}>
                        <td>{detail.itemNo}</td>
                        <td>{detail.partName}</td>
                        <td>{detail.partNo || "-"}</td>
                        <td style={{ textAlign: "right" }}>{detail.qtyOrdered}</td>
                        <td style={{ textAlign: "right" }}>{detail.receivedQty}</td>
                        <td style={{ textAlign: "right", fontWeight: detail.pendingQty > 0 ? "bold" : "normal", color: detail.pendingQty > 0 ? "#dc3545" : "inherit" }}>
                          {detail.pendingQty}
                        </td>
                        <td>{getStatusBadge(detail.receivedStatus)}</td>
                        <td>
                          {detail.pendingQty > 0 ? (
                            <button
                              className="btn-receive"
                              onClick={() => handleReceiveItem(detail)}
                              disabled={isReceiving}
                            >
                              Receive
                            </button>
                          ) : (
                            <span style={{ color: "#9ca3af" }}>-</span>
                          )}
                        </td>
                      </tr>
                      {isReceiving && formData && (
                        <tr className="receiving-form-row">
                          <td colSpan={8}>
                            <div className="receiving-form">
                              <div className="form-row">
                                <div className="form-group">
                                  <label>Quantity to Receive</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={detail.pendingQty}
                                    value={formData.receivedQty}
                                    onChange={(e) => {
                                      const qty = parseInt(e.target.value) || 0;
                                      setReceivingForms(prev => {
                                        const newMap = new Map(prev);
                                        newMap.set(detail.id, { ...formData, receivedQty: qty });
                                        return newMap;
                                      });
                                    }}
                                  />
                                  <small>Pending: {detail.pendingQty}</small>
                                </div>
                                <div className="form-group">
                                  <label>Receive Date</label>
                                  <input
                                    type="date"
                                    value={formData.receivedDate}
                                    onChange={(e) => {
                                      setReceivingForms(prev => {
                                        const newMap = new Map(prev);
                                        newMap.set(detail.id, { ...formData, receivedDate: e.target.value });
                                        return newMap;
                                      });
                                    }}
                                  />
                                </div>
                                <div className="form-group">
                                  <label>Location</label>
                                  <select
                                    value={formData.locationId || ""}
                                    onChange={(e) => {
                                      const locId = e.target.value ? parseInt(e.target.value) : undefined;
                                      setReceivingForms(prev => {
                                        const newMap = new Map(prev);
                                        newMap.set(detail.id, { ...formData, locationId: locId });
                                        return newMap;
                                      });
                                    }}
                                  >
                                    <option value="">Select Location</option>
                                    {locations.map((loc) => (
                                      <option key={loc.locationId} value={loc.locationId}>
                                        {loc.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="form-row">
                                <div className="form-group full-width">
                                  <label>Notes (Optional)</label>
                                  <input
                                    type="text"
                                    value={formData.notes}
                                    onChange={(e) => {
                                      setReceivingForms(prev => {
                                        const newMap = new Map(prev);
                                        newMap.set(detail.id, { ...formData, notes: e.target.value });
                                        return newMap;
                                      });
                                    }}
                                    placeholder="Enter any notes about this receiving..."
                                  />
                                </div>
                              </div>
                              <div className="form-actions">
                                <button
                                  type="button"
                                  className="btn-cancel"
                                  onClick={() => handleCancelReceiving(detail.id)}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="btn-submit"
                                  onClick={() => handleSubmitReceiving(detail)}
                                  disabled={receiving || formData.receivedQty <= 0}
                                >
                                  {receiving ? "Processing..." : "Confirm Receive"}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default VendorReceivingDetail;
































