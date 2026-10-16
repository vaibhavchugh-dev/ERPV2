import React, { useCallback, useEffect, useMemo, useState } from "react";
import moment from "moment";
import { toast } from "react-toastify";
import {
  OrderService,
  CopySourceOrder,
  CopySourceLine,
} from "../../Common/Services/OrderService";
import { getApiErrorMessage } from "../../Common/Services/FileUploadHelper";
import { formatPrefixedDocNumber } from "../../Common/Utils/displayDocNumberSearch";
import { toHtmlDateInputValue, fromHtmlDateInputValue } from "../../Common/Utils/Formatting";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import "./CopyFromPastOrderDialog.scss";

export interface CopiedOrderLine {
  partNo: string;
  partName: string;
  unit: string;
  qtyOrdered: number;
  unitPrice: number;
  discount: number;
  discountType: "Percent" | "Amount";
  productId?: number;
  notes: string;
  /** Display-format date, same as OrderDetailReq.DueDate. */
  dueDate: string;
}

export interface CopyFromPastOrderResult {
  sourceOrder: { orderId: number; orderNumber: number; orderDate: string };
  lines: CopiedOrderLine[];
  mode: "append" | "replace";
}

interface CopyFromPastOrderDialogProps {
  isOpen: boolean;
  customerId: number;
  customerName: string;
  excludeOrderId: number;
  /** Display-format order date of the order being edited; due dates are computed from it. */
  orderDate: string;
  /** Prefer past orders from this site (order site or active working site). */
  locationId?: number;
  existingPartNos: string[];
  hasExistingLines: boolean;
  /** Replacing is only offered when none of the existing lines have been saved. */
  canReplace: boolean;
  onCancel: () => void;
  onConfirm: (result: CopyFromPastOrderResult) => void;
}

interface ReviewRow extends CopySourceLine {
  selected: boolean;
  qty: string;
  dueDateIso: string;
  alreadyOnOrder: boolean;
  /** Editable discount amount/percent entered as string for controlled input. */
  discountInput: string;
}

type PriceMode = "current" | "last";

const orderLabel = (orderNumber: number) => formatPrefixedDocNumber("CO", orderNumber);

const CopyFromPastOrderDialog: React.FC<CopyFromPastOrderDialogProps> = ({
  isOpen,
  customerId,
  customerName,
  excludeOrderId,
  orderDate,
  locationId,
  existingPartNos,
  hasExistingLines,
  canReplace,
  onCancel,
  onConfirm,
}) => {
  const { formatCurrency, formatDateOnlyFromApi, currencySymbol } = useFormatting();

  const getStatusBadge = (status: string) => {
    if (!status || status.trim() === "") {
      return <span className="cpo-status-badge cpo-status-muted">-</span>;
    }
    const statusLower = status.toLowerCase().trim();
    if (statusLower === "draft") {
      return <span className="cpo-status-badge cpo-status-warning">Draft</span>;
    }
    if (statusLower === "in progress" || statusLower === "in-progress") {
      return <span className="cpo-status-badge cpo-status-primary">In Progress</span>;
    }
    if (statusLower === "partially shipped" || statusLower === "partially-shipped") {
      return <span className="cpo-status-badge cpo-status-primary">Partially Shipped</span>;
    }
    if (statusLower === "shipped") {
      return <span className="cpo-status-badge cpo-status-success">Shipped</span>;
    }
    if (statusLower === "partially invoiced" || statusLower === "partially-invoiced") {
      return <span className="cpo-status-badge cpo-status-info">Partially Invoiced</span>;
    }
    if (
      statusLower === "fully invoiced" ||
      statusLower === "fully-invoiced" ||
      statusLower === "invoiced"
    ) {
      return <span className="cpo-status-badge cpo-status-success">Fully Invoiced</span>;
    }
    if (statusLower === "completed") {
      return <span className="cpo-status-badge cpo-status-success">Completed</span>;
    }
    if (statusLower === "cancelled" || statusLower === "canceled") {
      return <span className="cpo-status-badge cpo-status-danger">Cancelled</span>;
    }
    return <span className="cpo-status-badge cpo-status-muted">{status}</span>;
  };

  const [step, setStep] = useState<"pick" | "review">("pick");
  const [orders, setOrders] = useState<CopySourceOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [highlighted, setHighlighted] = useState<CopySourceOrder | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [priceMode, setPriceMode] = useState<PriceMode>("current");
  const [mode, setMode] = useState<"append" | "replace">("append");

  const orderDateIso = toHtmlDateInputValue(orderDate) || moment().format("YYYY-MM-DD");
  const preferredLocationId =
    locationId && locationId > 0
      ? locationId
      : Number(localStorage.getItem("locationId") || 0) || undefined;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  useEffect(() => {
    if (!isOpen) return;

    setStep("pick");
    setRows([]);
    setHighlighted(null);
    setPriceMode("current");
    setMode("append");

    let cancelled = false;
    const loadOrders = async () => {
      setOrdersLoading(true);
      try {
        const result = await OrderService.GetRecentOrdersByCustomer(
          customerId,
          excludeOrderId,
          { locationId: preferredLocationId }
        );
        if (cancelled) return;
        setOrders(result);
        setHighlighted(result[0] || null);
      } catch (error) {
        if (cancelled) return;
        console.error("[CopyFromPastOrder] Error loading orders:", error);
        toast.error(getApiErrorMessage(error, "Failed to load past orders"));
        setOrders([]);
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    };

    loadOrders();
    return () => {
      cancelled = true;
    };
  }, [isOpen, customerId, excludeOrderId, preferredLocationId]);

  const reviewOrder = useCallback(
    async (order: CopySourceOrder) => {
      setHighlighted(order);
      setStep("review");
      setLinesLoading(true);
      setRows([]);
      try {
        const result = await OrderService.GetOrderLinesForCopy(order.orderId);
        const existing = new Set(
          existingPartNos.map((p) => p.trim().toUpperCase()).filter((p) => p.length > 0)
        );
        setRows(
          result.lines.map((line) => {
            const alreadyOnOrder =
              line.partNo.trim().length > 0 && existing.has(line.partNo.trim().toUpperCase());
            return {
              ...line,
              selected: !alreadyOnOrder,
              qty: String(line.qtyOrdered > 0 ? line.qtyOrdered : 1),
              dueDateIso: moment(orderDateIso, "YYYY-MM-DD")
                .add(line.leadDays, "days")
                .format("YYYY-MM-DD"),
              alreadyOnOrder,
              discountInput: String(line.discount ?? 0),
            };
          })
        );
      } catch (error) {
        console.error("[CopyFromPastOrder] Error loading order lines:", error);
        toast.error(getApiErrorMessage(error, "Failed to load order lines"));
        setStep("pick");
      } finally {
        setLinesLoading(false);
      }
    },
    [existingPartNos, orderDateIso]
  );

  const priceFor = (row: ReviewRow) =>
    priceMode === "current" && row.currentPrice != null ? row.currentPrice : row.lastPrice;

  const selectedRows = rows.filter((r) => r.selected);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const priceChangedCount = useMemo(
    () => rows.filter((r) => r.currentPrice != null && r.currentPrice !== r.lastPrice).length,
    [rows]
  );

  const updateRow = (index: number, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const handleConfirm = () => {
    if (!highlighted) return;
    if (selectedRows.length === 0) {
      toast.error("Select at least one line to copy");
      return;
    }

    const invalidQty = selectedRows.find((r) => {
      const qty = Number(r.qty);
      return !Number.isInteger(qty) || qty <= 0;
    });
    if (invalidQty) {
      toast.error(`Quantity for ${invalidQty.partNo || "a line"} must be a whole number greater than 0`);
      return;
    }

    const invalidDue = selectedRows.find((r) => !r.dueDateIso || r.dueDateIso < orderDateIso);
    if (invalidDue) {
      toast.error(`Due date for ${invalidDue.partNo || "a line"} cannot be earlier than the order date`);
      return;
    }

    const invalidDiscount = selectedRows.find((r) => {
      const d = Number(r.discountInput);
      return Number.isNaN(d) || d < 0;
    });
    if (invalidDiscount) {
      toast.error(`Discount for ${invalidDiscount.partNo || "a line"} must be zero or greater`);
      return;
    }

    onConfirm({
      sourceOrder: {
        orderId: highlighted.orderId,
        orderNumber: highlighted.orderNumber,
        orderDate: highlighted.orderDate,
      },
      mode: hasExistingLines && canReplace ? mode : "append",
      lines: selectedRows.map((r) => ({
        partNo: r.partNo,
        partName: r.partName,
        unit: r.unit,
        qtyOrdered: Number(r.qty),
        unitPrice: priceFor(r),
        discount: Number(r.discountInput) || 0,
        discountType: r.discountType,
        productId: r.productId,
        notes: r.notes,
        dueDate: fromHtmlDateInputValue(r.dueDateIso),
      })),
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="cpo-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div className="cpo-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="cpo-header">
          <div>
            <h2>
              {step === "pick"
                ? "Copy from past order"
                : `Review lines from ${highlighted ? orderLabel(highlighted.orderNumber) : ""}`}
            </h2>
            <p>
              {step === "pick"
                ? `Pick one of ${customerName || "this customer"}'s recent orders to copy lines from.`
                : "Choose the lines to add and adjust quantities, prices, discounts and due dates."}
            </p>
          </div>
          <button type="button" className="cpo-close" onClick={onCancel} title="Close">
            ×
          </button>
        </div>

        {step === "pick" ? (
          <div className="cpo-table-wrapper">
            <table className="cpo-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Order Date</th>
                  <th>Status</th>
                  <th className="cpo-num">Lines</th>
                  <th className="cpo-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {ordersLoading ? (
                  <tr>
                    <td colSpan={5} className="cpo-empty">
                      Loading past orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="cpo-empty">
                      <p>
                        {preferredLocationId
                          ? "No past orders found for this location"
                          : "No past orders found"}
                      </p>
                      <small>Cancelled orders and orders from other locations are not listed.</small>
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr
                      key={order.orderId}
                      className={`cpo-clickable ${highlighted?.orderId === order.orderId ? "is-selected" : ""}`}
                      onClick={() => setHighlighted(order)}
                      onDoubleClick={() => reviewOrder(order)}
                    >
                      <td className="cpo-strong">{orderLabel(order.orderNumber)}</td>
                      <td>{formatDateOnlyFromApi(order.orderDate, true)}</td>
                      <td>{getStatusBadge(order.status)}</td>
                      <td className="cpo-num">{order.lineCount}</td>
                      <td className="cpo-num">{formatCurrency(order.totalAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="cpo-toolbar">
              <label className="cpo-field">
                <span>Unit price</span>
                <select
                  value={priceMode}
                  onChange={(e) => setPriceMode(e.target.value as PriceMode)}
                >
                  <option value="current">Current price (falls back to last price)</option>
                  <option value="last">Last order price</option>
                </select>
              </label>
              {priceChangedCount > 0 && (
                <span className="cpo-note">
                  {priceChangedCount} line(s) have a different current price
                </span>
              )}
              {hasExistingLines && (
                <div className="cpo-mode">
                  <label>
                    <input
                      type="radio"
                      checked={mode === "append" || !canReplace}
                      onChange={() => setMode("append")}
                    />
                    Add to existing lines
                  </label>
                  <label title={canReplace ? "" : "Saved lines can't be replaced; delete them individually instead"}>
                    <input
                      type="radio"
                      checked={mode === "replace" && canReplace}
                      disabled={!canReplace}
                      onChange={() => setMode("replace")}
                    />
                    Replace existing lines
                  </label>
                </div>
              )}
            </div>

            <div className="cpo-table-wrapper">
              <table className="cpo-table">
                <thead>
                  <tr>
                    <th className="cpo-check">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={rows.length === 0}
                        onChange={(e) =>
                          setRows((prev) => prev.map((r) => ({ ...r, selected: e.target.checked })))
                        }
                      />
                    </th>
                    <th>Part No</th>
                    <th>Description</th>
                    <th className="cpo-num">Qty</th>
                    <th>Unit</th>
                    <th className="cpo-num">Last Price</th>
                    <th className="cpo-num">Current Price</th>
                    <th className="cpo-num">Price Used</th>
                    <th className="cpo-discount-heading">Discount</th>
                    <th>Due Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {linesLoading ? (
                    <tr>
                      <td colSpan={11} className="cpo-empty">
                        Loading lines...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="cpo-empty">
                        <p>This order has no lines that can be copied</p>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => {
                      const priceDiffers =
                        row.currentPrice != null && row.currentPrice !== row.lastPrice;
                      return (
                        <tr key={`${row.itemNo}-${index}`} className={row.selected ? "" : "is-muted"}>
                          <td className="cpo-check">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={(e) => updateRow(index, { selected: e.target.checked })}
                            />
                          </td>
                          <td className="cpo-strong">{row.partNo || "—"}</td>
                          <td className="cpo-desc" title={row.partName}>
                            {row.partName.split(/\r?\n/)[0] || "—"}
                          </td>
                          <td className="cpo-num">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              className="cpo-input cpo-qty"
                              value={row.qty}
                              onChange={(e) => updateRow(index, { qty: e.target.value })}
                            />
                          </td>
                          <td>{row.unit}</td>
                          <td className="cpo-num">{formatCurrency(row.lastPrice)}</td>
                          <td className={`cpo-num ${priceDiffers ? "cpo-diff" : ""}`}>
                            {row.currentPrice != null ? formatCurrency(row.currentPrice) : "—"}
                          </td>
                          <td className="cpo-num cpo-strong">{formatCurrency(priceFor(row))}</td>
                          <td className="cpo-discount-cell">
                            <div className="cpo-discount">
                              <select
                                className="cpo-input cpo-discount-type"
                                value={row.discountType}
                                onChange={(e) =>
                                  updateRow(index, {
                                    discountType: e.target.value === "Amount" ? "Amount" : "Percent",
                                  })
                                }
                                title="Discount type"
                              >
                                <option value="Percent">%</option>
                                <option value="Amount">{currencySymbol}</option>
                              </select>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                className="cpo-input cpo-discount-input"
                                value={row.discountInput}
                                onChange={(e) =>
                                  updateRow(index, {
                                    discountInput: e.target.value,
                                    discount: Number(e.target.value) || 0,
                                  })
                                }
                                title="Discount"
                              />
                            </div>
                          </td>
                          <td>
                            <input
                              type="date"
                              className="cpo-input"
                              min={orderDateIso}
                              value={row.dueDateIso}
                              onChange={(e) => updateRow(index, { dueDateIso: e.target.value })}
                            />
                          </td>
                          <td className="cpo-flags">
                            {row.alreadyOnOrder && (
                              <span className="cpo-badge cpo-badge-info" title="This part is already on the order">
                                Already on order
                              </span>
                            )}
                            {row.productMissing && (
                              <span
                                className="cpo-badge cpo-badge-warn"
                                title="The product this line was linked to no longer exists; it will be added without a product link"
                              >
                                Product missing
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="cpo-footer">
          <span className="cpo-summary">
            {step === "pick"
              ? orders.length > 0
                ? `${orders.length} recent order(s)`
                : ""
              : `${selectedRows.length} of ${rows.length} line(s) selected`}
          </span>
          <div className="cpo-actions">
            {step === "review" && (
              <button type="button" className="cpo-btn-secondary" onClick={() => setStep("pick")}>
                Back
              </button>
            )}
            <button type="button" className="cpo-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            {step === "pick" ? (
              <button
                type="button"
                className="cpo-btn-primary"
                disabled={!highlighted || ordersLoading}
                onClick={() => highlighted && reviewOrder(highlighted)}
              >
                Review Lines
              </button>
            ) : (
              <button
                type="button"
                className="cpo-btn-primary"
                disabled={linesLoading || selectedRows.length === 0}
                onClick={handleConfirm}
              >
                {hasExistingLines && canReplace && mode === "replace"
                  ? `Replace with ${selectedRows.length} Line(s)`
                  : `Add ${selectedRows.length} Line(s)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CopyFromPastOrderDialog;
