import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  InventoryService,
  InventoryBalance,
  getTenantId,
} from "../../Common/Services/InventoryService";
import { ProductMasterService } from "../../Common/Services/ProductMasterService";
import "./StockMovementModal.scss";

type MovementType = "receive" | "issue" | "transfer" | "adjust";

interface StockMovementModalProps {
  type: MovementType;
  balance?: InventoryBalance | null;
  fallbackProducts?: ProductOption[];
  locations: { locationId: number; name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

interface ProductOption {
  id: number;
  partNo?: string;
  partName?: string;
}

interface RawMaterialOption {
  id: number;
  partNo?: string;
  partName?: string;
}

const StockMovementModal: React.FC<StockMovementModalProps> = ({
  type,
  balance,
  fallbackProducts = [],
  locations,
  onClose,
  onSuccess,
}) => {
  const [materialType, setMaterialType] = useState<"product" | "raw">(
    balance?.productId ? "product" : balance?.rawMaterialId ? "raw" : "product"
  );
  const [productId, setProductId] = useState<number | "">(
    balance?.productId ?? ""
  );
  const [rawMaterialId, setRawMaterialId] = useState<number | "">(
    balance?.rawMaterialId ?? ""
  );
  const [locationId, setLocationId] = useState<number>(
    balance?.locationId ?? (locations[0]?.locationId ?? 0)
  );
  const [fromLocationId, setFromLocationId] = useState<number>(
    balance?.locationId ?? (locations[0]?.locationId ?? 0)
  );
  const [toLocationId, setToLocationId] = useState<number>(
    locations[1]?.locationId ?? locations[0]?.locationId ?? 0
  );
  const [quantity, setQuantity] = useState<string>(
    type === "adjust" ? "" : "1"
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialOption[]>([]);

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    if (balance) {
      setProductId(balance.productId ?? "");
      setRawMaterialId(balance.rawMaterialId ?? "");
      setLocationId(balance.locationId);
      setFromLocationId(balance.locationId);
    }
  }, [balance]);

  const loadOptions = async (forceSync = false) => {
    try {
      const tenantId = getTenantId();

      type MasterLike = {
        partNo?: string;
        partName?: string;
        productId?: number;
        id?: number;
      };

      const buildProductOptions = (
        fromOrders: MasterLike[],
        fromMaster: MasterLike[]
      ): ProductOption[] => {
        const resolveId = (p: MasterLike) =>
          Number(p.productId ?? p.id ?? 0) || 0;

        const byId = new Map<number, ProductOption>();
        for (const p of fromMaster) {
          const id = resolveId(p);
          if (id <= 0) continue;
          const partNo = (p.partNo ?? "").trim();
          const partName = (p.partName ?? "").trim();
          byId.set(id, {
            id,
            partNo: partNo || (partName ? "" : `Product #${id}`),
            partName: partName || "",
          });
        }
        const masterByPartNo = new Map<string, number>();
        for (const p of fromMaster) {
          const id = resolveId(p);
          if (id > 0 && p.partNo)
            masterByPartNo.set((p.partNo || "").toLowerCase(), id);
        }
        for (const p of fromOrders) {
          const id =
            resolveId(p) ||
            masterByPartNo.get((p.partNo || "").toLowerCase()) ||
            0;
          if (id <= 0) continue;
          const partNo = (p.partNo ?? "").trim();
          const partName = (p.partName ?? "").trim();
          if (!partNo && !partName) continue;
          byId.set(id, {
            id,
            partNo: partNo || "",
            partName: partName || "",
          });
        }
        return Array.from(byId.values()).sort((a, b) =>
          (a.partNo || "").localeCompare(b.partNo || "")
        );
      };

      const mapInventoryProducts = (
        list: { id: number; partNo?: string; partName?: string }[]
      ): ProductOption[] =>
        list.map((p) => ({
          id: p.id,
          partNo: (p.partNo ?? "").trim() || `Product #${p.id}`,
          partName: (p.partName ?? "").trim(),
        }));

      // Prefer Inventory GetProducts (server-side merge of ProductMaster + orders),
      // but don't fail the whole modal if one endpoint errors.
      const [invProductsRes, fromOrdersRes, fromMasterRes] =
        await Promise.allSettled([
          InventoryService.GetProducts(),
          ProductMasterService.GetProductsFromOrders({ tenantid: tenantId }),
          ProductMasterService.GetProductMasterList({ tenantid: tenantId }),
        ]);

      let invProducts =
        invProductsRes.status === "fulfilled" ? invProductsRes.value : null;
      let fromOrders =
        fromOrdersRes.status === "fulfilled" ? fromOrdersRes.value : [];
      let fromMaster =
        fromMasterRes.status === "fulfilled" ? fromMasterRes.value : [];

      let productOptions: ProductOption[] =
        Array.isArray(invProducts) && invProducts.length > 0
          ? mapInventoryProducts(invProducts)
          : [];

      let orderList = Array.isArray(fromOrders) ? fromOrders : [];
      let masterList = Array.isArray(fromMaster) ? fromMaster : [];

      if (productOptions.length === 0) {
        productOptions = buildProductOptions(orderList, masterList);
      }

      // Only sync when explicitly requested by user action.
      if (forceSync) {
        await ProductMasterService.SyncFromOrders();
        fromMaster = await ProductMasterService.GetProductMasterList({
          tenantid: tenantId,
        });
        masterList = Array.isArray(fromMaster) ? fromMaster : [];
        productOptions = buildProductOptions(orderList, masterList);
      }

      if (productOptions.length === 0) {
        invProducts = await InventoryService.GetProducts();
        if (Array.isArray(invProducts) && invProducts.length > 0) {
          productOptions = mapInventoryProducts(invProducts);
        }
      }

      // Last-resort fallback: use products already visible on the inventory page.
      if (productOptions.length === 0 && fallbackProducts.length > 0) {
        productOptions = fallbackProducts;
      }

      setProducts(productOptions);
      const rawMaterialsResult = await InventoryService.GetRawMaterials();
      setRawMaterials(rawMaterialsResult || []);
    } catch (err) {
      const apiError = (err as any)?.response?.data?.error;
      console.error("Error loading options:", apiError || err);
      toast.error("Could not load product list. Check your connection and try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Enter a valid positive quantity");
      return;
    }
    if (type === "transfer" && qty <= 0) {
      toast.error("Enter a valid quantity for transfer");
      return;
    }
    if (type === "adjust" && qty === 0) {
      toast.error("Adjustment quantity cannot be zero");
      return;
    }

    const hasProduct = materialType === "product" && productId !== "";
    const hasRaw = materialType === "raw" && rawMaterialId !== "";
    if (!hasProduct && !hasRaw) {
      toast.error("Select a product or raw material");
      return;
    }

    setLoading(true);
    try {
      let result: { success: boolean; error?: string };

      const common = {
        productId: hasProduct ? Number(productId) : undefined,
        rawMaterialId: hasRaw ? Number(rawMaterialId) : undefined,
        notes: notes || undefined,
      };

      switch (type) {
        case "receive":
          result = await InventoryService.ReceiveStock({
            ...common,
            locationId,
            quantity: qty,
          });
          break;
        case "issue":
          result = await InventoryService.IssueStock({
            ...common,
            locationId,
            quantity: qty,
          });
          break;
        case "transfer":
          if (fromLocationId === toLocationId) {
            toast.error("Source and destination must be different");
            setLoading(false);
            return;
          }
          result = await InventoryService.TransferStock({
            ...common,
            fromLocationId,
            toLocationId,
            quantity: qty,
          });
          break;
        case "adjust":
          result = await InventoryService.AdjustStock({
            ...common,
            locationId,
            quantity: qty,
          });
          break;
        default:
          result = { success: false };
      }

      if (result.success) {
        toast.success(
          type === "receive"
            ? "Stock received"
            : type === "issue"
            ? "Stock issued"
            : type === "transfer"
            ? "Stock transferred"
            : "Stock adjusted"
        );
        onSuccess();
      } else {
        toast.error(result.error || "Operation failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  const title =
    type === "receive"
      ? "Receive Stock"
      : type === "issue"
      ? "Issue Stock"
      : type === "transfer"
      ? "Transfer Stock"
      : "Adjust Stock";

  return (
    <div className="stock-movement-overlay" onClick={onClose}>
      <div
        className="stock-movement-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-row">
            <label>Material Type</label>
            <select
              value={materialType}
              onChange={(e) => {
                setMaterialType(e.target.value as "product" | "raw");
                setProductId("");
                setRawMaterialId("");
              }}
            >
              <option value="product">Product (Finished)</option>
              <option value="raw">Raw Material</option>
            </select>
          </div>

          {materialType === "product" ? (
            <div className="form-row">
              <label>Product</label>
              <select
                value={productId}
                onChange={(e) =>
                  setProductId(e.target.value === "" ? "" : Number(e.target.value))
                }
                required
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.partNo || ""} - {p.partName || ""}
                  </option>
                ))}
              </select>
              {products.length === 0 && (
                <div className="form-row-help" style={{ marginTop: 8 }}>
                  <p style={{ margin: "0 0 8px 0", fontSize: 13, color: "#666" }}>
                    No products found. Products come from Product Master or customer orders/quotations.
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 13 }}
                    disabled={syncing}
                    onClick={async () => {
                      setSyncing(true);
                      try {
                        await loadOptions(true);
                        toast.success("Sync complete. Check the product list.");
                      } catch (e) {
                        toast.error("Sync failed.");
                      } finally {
                        setSyncing(false);
                      }
                    }}
                  >
                    {syncing ? "Syncing…" : "Sync from orders"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="form-row">
              <label>Raw Material</label>
              <select
                value={rawMaterialId}
                onChange={(e) =>
                  setRawMaterialId(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                required
              >
                <option value="">Select raw material</option>
                {rawMaterials.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    {rm.partNo || ""} - {rm.partName || ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {type === "transfer" ? (
            <>
              <div className="form-row">
                <label>From Location</label>
                <select
                  value={fromLocationId}
                  onChange={(e) => setFromLocationId(Number(e.target.value))}
                >
                  {locations.map((loc) => (
                    <option key={loc.locationId} value={loc.locationId}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>To Location</label>
                <select
                  value={toLocationId}
                  onChange={(e) => setToLocationId(Number(e.target.value))}
                >
                  {locations.map((loc) => (
                    <option key={loc.locationId} value={loc.locationId}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="form-row">
              <label>Location</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(Number(e.target.value))}
              >
                {locations.map((loc) => (
                  <option key={loc.locationId} value={loc.locationId}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row">
            <label>Quantity {type === "adjust" && "(+ or -)"}</label>
            <input
              type="number"
              step="0.01"
              min={type === "adjust" ? undefined : "0.01"}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={type === "adjust" ? "e.g. 10 or -5" : "0"}
              required
            />
          </div>

          <div className="form-row">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Processing..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockMovementModal;
