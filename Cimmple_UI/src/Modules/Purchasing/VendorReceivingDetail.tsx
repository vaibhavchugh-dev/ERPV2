import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import {
  VendorReceivingService,
  OrderForReceivingDetail,
  OrderDetailForReceiving,
} from "../../Common/Services/VendorReceivingService";
import { LocationService, LocationMaster } from "../../Common/Services/LocationService";
import { useActiveLocation } from "../../Common/Hooks/useActiveLocation";
import "./VendorReceivingDetail.scss";

interface VendorReceivingDetailProps {
  orderId: number;
  onClose: (refreshList?: boolean) => void;
}

interface ReceivingFormData {
  orderDetailId: number;
  receivedQty: number;
  receivedDate: string;
  locationId?: number;
  notes: string;
  lotNumber: string;
}

/** Stock lines that book inventory need a location when a master id is present. */
function willBookInventory(detail: OrderDetailForReceiving): boolean {
  const jobTied =
    (detail.jobId != null && detail.jobId > 0) ||
    !!(detail.jobNumber && detail.jobNumber.trim());
  if (jobTied) return false;

  const lineType = (detail.lineType || "").trim();
  if (
    lineType === "Service" ||
    lineType === "Subcontract" ||
    lineType === "Tool" ||
    lineType === "Other"
  ) {
    return false;
  }
  if (lineType === "RawMaterial") {
    return (
      !!(detail.rawMaterialId && detail.rawMaterialId > 0) ||
      !!(detail.productId && detail.productId > 0) // legacy until re-picked as RM
    );
  }
  if (lineType === "FinishedProduct") {
    return !!(detail.productId && detail.productId > 0);
  }
  // Legacy product-only stock lines
  return !!(detail.productId && detail.productId > 0 && !detail.rawMaterialId);
}

const VendorReceivingDetail: React.FC<VendorReceivingDetailProps> = ({
  orderId,
  onClose,
}) => {
  const listNeedsRefreshRef = useRef(false);
  const ignoreBackdropClickRef = useRef(true);
  const { locationId: activeLocationId } = useActiveLocation();
  const [order, setOrder] = useState<OrderForReceivingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState(false);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [receivingForms, setReceivingForms] = useState<Map<number, ReceivingFormData>>(new Map());
  const [showReceivingForm, setShowReceivingForm] = useState<Map<number, boolean>>(new Map());

  const defaultReceiveLocationId = (): number | undefined => {
    if (order?.locationId && order.locationId > 0) return order.locationId;
    if (activeLocationId > 0) return activeLocationId;
    return undefined;
  };

  useEffect(() => {
    ignoreBackdropClickRef.current = true;
    const timer = window.setTimeout(() => {
      ignoreBackdropClickRef.current = false;
    }, 400);
    return () => window.clearTimeout(timer);
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;

    const loadOrder = async () => {
      if (!orderId) {
        setLoading(false);
        setOrder(null);
        return;
      }

      setLoading(true);
      try {
        const result = await VendorReceivingService.GetOrderForReceiving(orderId);
        if (!cancelled) {
          setOrder(result || null);
        }
      } catch (error: any) {
        console.error("[VendorReceivingDetail] Error loading order:", error);
        toast.error(`Error loading order: ${error.message || "Unknown error"}`);
        if (!cancelled) {
          setOrder(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const loadLocations = async () => {
      try {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        const tenantID = storage?.tenantID || 0;
        const result = await LocationService.GetLocations({ tenantid: tenantID });
        if (!cancelled && result && Array.isArray(result)) {
          setLocations(result);
        }
      } catch (error: any) {
        console.error("Error loading locations:", error);
      }
    };

    loadOrder();
    loadLocations();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (ignoreBackdropClickRef.current) return;
    onClose(listNeedsRefreshRef.current);
  };

  const reloadOrder = async () => {
    try {
      const result = await VendorReceivingService.GetOrderForReceiving(orderId);
      if (result) {
        setOrder(result);
      }
    } catch (error: any) {
      console.error("[VendorReceivingDetail] Error loading order:", error);
      toast.error(`Error loading order: ${error.message || "Unknown error"}`);
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
      locationId: defaultReceiveLocationId(),
      notes: "",
      lotNumber: "",
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

    if (willBookInventory(detail) && !(formData.locationId && formData.locationId > 0)) {
      toast.error("Select a location — this stock receipt will update inventory.");
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
        lotNumber: formData.lotNumber,
        tenantid: tenantID,
      });

      if (result.success) {
        toast.success(result.message || "Items received successfully");
        listNeedsRefreshRef.current = true;
        handleCancelReceiving(detail.id);
        reloadOrder();
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

    const missingLocation = formsToSubmit.find(([detailId, formData]) => {
      const detail = order?.details.find((d) => d.id === detailId);
      return (
        detail &&
        willBookInventory(detail) &&
        !(formData.locationId && formData.locationId > 0)
      );
    });
    if (missingLocation) {
      toast.error("Select a location for every stock line that updates inventory.");
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
            lotNumber: formData.lotNumber,
            tenantid: tenantID,
          })
        )
      );

      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        toast.success(`Successfully received ${formsToSubmit.length} item(s)`);
        listNeedsRefreshRef.current = true;
        setReceivingForms(new Map());
        setShowReceivingForm(new Map());
        reloadOrder();
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

  const hasPendingReceiving = Array.from(receivingForms.values()).some(f => f.receivedQty > 0);

  return createPortal(
    <div className="receiving-detail-overlay" onClick={handleBackdropClick}>
      <div className="receiving-detail-card" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <>
            <div className="receiving-header">
              <div>
                <h2>Receive Items</h2>
                <p style={{ margin: "0.5rem 0 0 0", color: "#6b7280" }}>Loading order details...</p>
              </div>
              <button className="btn-close" onClick={() => onClose(listNeedsRefreshRef.current)}>
                ×
              </button>
            </div>
            <div className="page-loading">
              <div className="loading-spinner"></div>
              <p>Loading order details...</p>
            </div>
          </>
        ) : !order ? (
          <>
            <div className="receiving-header">
              <div>
                <h2>Receive Items</h2>
              </div>
              <button className="btn-close" onClick={() => onClose(listNeedsRefreshRef.current)}>
                ×
              </button>
            </div>
            <div style={{ padding: "2rem", textAlign: "center" }}>
              <p>Order not found</p>
              <button className="btn-submit" onClick={() => onClose(listNeedsRefreshRef.current)}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
        <div className="receiving-header">
          <div>
            <h2>Receive Items - PO #{order.orderNumber}</h2>
            <p style={{ margin: "0.5rem 0 0 0", color: "#6b7280" }}>
              {order.vendorName} • Order Date: {formatDate(order.orderDate)}
            </p>
          </div>
          <button className="btn-close" onClick={() => onClose(listNeedsRefreshRef.current)}>
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
                                    step="1"
                                    max={detail.pendingQty}
                                    value={formData.receivedQty}
                                    onChange={(e) => {
                                      const qty = parseInt(e.target.value, 10);
                                      setReceivingForms(prev => {
                                        const newMap = new Map(prev);
                                        newMap.set(detail.id, {
                                          ...formData,
                                          receivedQty: Number.isNaN(qty) ? 0 : qty,
                                        });
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
                                  <label>
                                    Location
                                    {willBookInventory(detail) ? " *" : ""}
                                  </label>
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
                                        {activeLocationId === loc.locationId ? " (working site)" : ""}
                                      </option>
                                    ))}
                                  </select>
                                  {willBookInventory(detail) && (
                                    <small>Required — this receipt updates inventory on hand</small>
                                  )}
                                </div>
                                <div className="form-group">
                                  <label>Lot / heat (optional)</label>
                                  <input
                                    type="text"
                                    value={formData.lotNumber}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setReceivingForms((prev) => {
                                        const newMap = new Map(prev);
                                        newMap.set(detail.id, { ...formData, lotNumber: value });
                                        return newMap;
                                      });
                                    }}
                                    placeholder="e.g. H-8841"
                                  />
                                  <small>Mill heat or vendor lot for material certs</small>
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
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default VendorReceivingDetail;
































