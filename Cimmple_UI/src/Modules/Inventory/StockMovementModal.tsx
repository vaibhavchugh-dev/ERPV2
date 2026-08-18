import React, { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "react-toastify";
import {
  InventoryService,
  InventoryBalance,
  MovementDocumentOption,
  MovementDocuments,
  InventoryLotOption,
  getTenantId,
} from "../../Common/Services/InventoryService";
import { ProductMasterService } from "../../Common/Services/ProductMasterService";
import "./StockMovementModal.scss";

type MovementType = "receive" | "issue" | "transfer" | "adjust" | "reserve";

interface StockMovementModalProps {
  type: MovementType;
  balance?: InventoryBalance | null;
  balances?: InventoryBalance[];
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
  isRemnant?: boolean;
  parentRawMaterialId?: number;
  parentPartNo?: string;
  thicknessMm?: number;
  widthMm?: number;
  lengthMm?: number;
}

const millFamilyId = (rm: RawMaterialOption): number =>
  rm.isRemnant && rm.parentRawMaterialId ? rm.parentRawMaterialId : rm.id;

const availableAtLocation = (
  rawMaterialId: number,
  locationId: number,
  balances: InventoryBalance[]
): number =>
  balances
    .filter(
      (b) => b.rawMaterialId === rawMaterialId && b.locationId === locationId
    )
    .reduce((sum, b) => sum + (b.quantityAvailable ?? 0), 0);

const formatRmSize = (rm: RawMaterialOption): string => {
  const parts = [rm.thicknessMm, rm.widthMm, rm.lengthMm].filter((n) => n != null);
  return parts.length ? `${parts.join("×")} mm` : "";
};

const pickShortestRemnant = (
  materials: RawMaterialOption[],
  balances: InventoryBalance[],
  familyId: number,
  locationId: number
): RawMaterialOption | undefined =>
  materials
    .filter(
      (rm) =>
        rm.isRemnant &&
        millFamilyId(rm) === familyId &&
        availableAtLocation(rm.id, locationId, balances) > 0
    )
    .sort((a, b) => (a.lengthMm ?? Number.POSITIVE_INFINITY) - (b.lengthMm ?? Number.POSITIVE_INFINITY))[0];

const StockMovementModal: React.FC<StockMovementModalProps> = ({
  type,
  balance,
  balances = [],
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
  const [referenceType, setReferenceType] = useState(
    type === "reserve" ? "JobOrder" : ""
  );
  const [referenceId, setReferenceId] = useState<number | "">("");
  const [documents, setDocuments] = useState<MovementDocuments>({
    jobs: [],
    vendorReceivings: [],
    shipments: [],
  });
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>(fallbackProducts);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialOption[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [leftoverLengthMm, setLeftoverLengthMm] = useState("");
  const [leftoverWidthMm, setLeftoverWidthMm] = useState("");
  const [leftoverThicknessMm, setLeftoverThicknessMm] = useState("");
  const [preferredRemnantNote, setPreferredRemnantNote] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [lotId, setLotId] = useState<number | "">("");
  const [lots, setLots] = useState<InventoryLotOption[]>([]);
  const preferRemnantDone = useRef(false);

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    if (referenceType && !documentsLoaded) {
      loadDocuments();
    }
  }, [referenceType, documentsLoaded]);

  useEffect(() => {
    if (balance) {
      setProductId(balance.productId ?? "");
      setRawMaterialId(balance.rawMaterialId ?? "");
      setLocationId(balance.locationId);
      setFromLocationId(balance.locationId);
    }
  }, [balance]);

  useEffect(() => {
    if (preferRemnantDone.current) return;
    if (type !== "issue" || !balance?.rawMaterialId || rawMaterials.length === 0) return;

    const opened = rawMaterials.find((rm) => rm.id === balance.rawMaterialId);
    if (!opened) return;
    preferRemnantDone.current = true;
    if (opened.isRemnant) return;

    const preferred = pickShortestRemnant(
      rawMaterials,
      balances,
      opened.id,
      balance.locationId
    );
    if (!preferred) return;

    setRawMaterialId(preferred.id);
    const size = formatRmSize(preferred);
    setPreferredRemnantNote(
      `Using remnant ${preferred.partNo || preferred.partName || preferred.id}${
        size ? ` (${size})` : ""
      } instead of mill stock ${opened.partNo || opened.partName || ""}. Shortest leftover on this shelf is selected first.`
    );
  }, [type, balance, rawMaterials, balances]);

  const loadDocuments = async () => {
    try {
      const result = await InventoryService.GetMovementDocuments();
      setDocuments({
        jobs: result?.jobs || [],
        vendorReceivings: result?.vendorReceivings || [],
        shipments: result?.shipments || [],
      });
    } catch {
      setDocuments({ jobs: [], vendorReceivings: [], shipments: [] });
    } finally {
      setDocumentsLoaded(true);
    }
  };

  const documentOptions = (): MovementDocumentOption[] => {
    if (referenceType === "JobOrder") return documents.jobs;
    if (referenceType === "VendorReceiving") return documents.vendorReceivings;
    if (referenceType === "CustomerShipment") return documents.shipments;
    return [];
  };

  const selectedRawMaterial =
    rawMaterialId === ""
      ? undefined
      : rawMaterials.find((rm) => rm.id === Number(rawMaterialId));

  const issueLocationId = type === "transfer" ? fromLocationId : locationId;

  useEffect(() => {
    const loadLots = async () => {
      if (type !== "issue" && type !== "transfer" && type !== "adjust") {
        setLots([]);
        return;
      }
      const pid = materialType === "product" && productId !== "" ? Number(productId) : undefined;
      const rid = materialType === "raw" && rawMaterialId !== "" ? Number(rawMaterialId) : undefined;
      if (!pid && !rid) {
        setLots([]);
        return;
      }
      try {
        const rows = await InventoryService.GetLots({
          productId: pid,
          rawMaterialId: rid,
          locationId: issueLocationId,
        });
        setLots(rows);
      } catch {
        setLots([]);
      }
    };
    loadLots();
  }, [type, materialType, productId, rawMaterialId, issueLocationId]);

  const issueRmGroups = useMemo(() => {
    const familyFocus =
      selectedRawMaterial
        ? millFamilyId(selectedRawMaterial)
        : balance?.rawMaterialId && !balance.isRemnant
        ? balance.rawMaterialId
        : balance?.parentRawMaterialId || undefined;

    const compareRm = (a: RawMaterialOption, b: RawMaterialOption) => {
      const aFam = familyFocus && millFamilyId(a) === familyFocus ? 0 : 1;
      const bFam = familyFocus && millFamilyId(b) === familyFocus ? 0 : 1;
      if (aFam !== bFam) return aFam - bFam;
      const aLen = a.lengthMm ?? Number.POSITIVE_INFINITY;
      const bLen = b.lengthMm ?? Number.POSITIVE_INFINITY;
      if (aLen !== bLen) return aLen - bLen;
      return (a.partNo || "").localeCompare(b.partNo || "");
    };

    const onShelfRemnants = rawMaterials
      .filter(
        (rm) =>
          rm.isRemnant && availableAtLocation(rm.id, issueLocationId, balances) > 0
      )
      .sort(compareRm);

    const onShelfIds = new Set(onShelfRemnants.map((rm) => rm.id));
    const rest = rawMaterials
      .filter((rm) => !onShelfIds.has(rm.id))
      .sort((a, b) => {
        const aRem = a.isRemnant ? 0 : 1;
        const bRem = b.isRemnant ? 0 : 1;
        if (aRem !== bRem) return aRem - bRem;
        return (a.partNo || "").localeCompare(b.partNo || "");
      });

    return { onShelfRemnants, rest };
  }, [
    rawMaterials,
    balances,
    issueLocationId,
    selectedRawMaterial,
    balance,
  ]);

  const mapMasterProducts = (list: any[]): ProductOption[] => {
    const byId = new Map<number, ProductOption>();
    for (const p of list || []) {
      const id = Number(p.productId ?? p.id ?? 0) || 0;
      if (id <= 0) continue;
      const partNo = String(p.partNo ?? "").trim();
      const partName = String(p.partName ?? "").trim();
      byId.set(id, {
        id,
        partNo: partNo || (partName ? "" : `Product #${id}`),
        partName: partName || "",
      });
    }
    return Array.from(byId.values()).sort((a, b) =>
      (a.partNo || "").localeCompare(b.partNo || "")
    );
  };

  const loadOptions = async (forceSync = false) => {
    setOptionsLoading(true);
    try {
      const tenantId = getTenantId();

      if (forceSync) {
        await ProductMasterService.SyncFromOrders();
      }

      const [fromMasterRes, rawMaterialsRes] = await Promise.allSettled([
        ProductMasterService.GetProductMasterList({ tenantid: tenantId }),
        InventoryService.GetRawMaterials(),
      ]);

      let productOptions =
        fromMasterRes.status === "fulfilled"
          ? mapMasterProducts(fromMasterRes.value || [])
          : [];

      if (productOptions.length === 0 && fallbackProducts.length > 0) {
        productOptions = fallbackProducts;
      }

      setProducts(productOptions);
      setRawMaterials(
        rawMaterialsRes.status === "fulfilled"
          ? (rawMaterialsRes.value || []).map((rm) => ({
              id: rm.id,
              partNo: rm.partNo,
              partName: rm.partName,
              isRemnant: rm.isRemnant,
              parentRawMaterialId: rm.parentRawMaterialId,
              parentPartNo: rm.parentPartNo,
              thicknessMm: rm.thicknessMm,
              widthMm: rm.widthMm,
              lengthMm: rm.lengthMm,
            }))
          : []
      );
    } catch (err) {
      const apiError = (err as any)?.response?.data?.error;
      console.error("Error loading options:", apiError || err);
      toast.error("Could not load product list. Check your connection and try again.");
    } finally {
      setOptionsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (isNaN(qty) || (type === "adjust" ? qty === 0 : qty <= 0)) {
      toast.error(
        type === "adjust"
          ? "Adjustment quantity cannot be zero"
          : "Enter a valid positive quantity"
      );
      return;
    }

    if (type === "reserve" && (referenceType !== "JobOrder" || referenceId === "")) {
      toast.error("Select a job to reserve this quantity for.");
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
        referenceType: referenceType || undefined,
        referenceId:
          referenceType && referenceId !== "" ? Number(referenceId) : undefined,
      };

      switch (type) {
        case "receive":
          result = await InventoryService.ReceiveStock({
            ...common,
            locationId,
            quantity: qty,
            lotNumber: lotNumber.trim() || undefined,
          });
          break;
        case "issue": {
          const parseMm = (v: string): number | undefined => {
            const t = v.trim();
            if (t === "") return undefined;
            const n = Number(t);
            return Number.isNaN(n) ? undefined : n;
          };
          const leftoverLength = parseMm(leftoverLengthMm);
          const leftoverWidth = parseMm(leftoverWidthMm);
          const leftoverThickness = parseMm(leftoverThicknessMm);
          if (
            leftoverLengthMm.trim() !== "" &&
            (leftoverLength == null || leftoverLength <= 0)
          ) {
            toast.error("Leftover length must be greater than 0 mm.");
            setLoading(false);
            return;
          }
          if (
            leftoverLength == null &&
            (leftoverWidth != null || leftoverThickness != null)
          ) {
            toast.error("Enter leftover length if you are recording an offcut.");
            setLoading(false);
            return;
          }
          result = await InventoryService.IssueStock({
            ...common,
            locationId,
            quantity: qty,
            leftoverLengthMm: leftoverLength,
            leftoverWidthMm: leftoverWidth,
            leftoverThicknessMm: leftoverThickness,
            lotId: lotId === "" ? undefined : Number(lotId),
          });
          break;
        }
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
        case "reserve":
          result = await InventoryService.ReserveStock({
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
            : type === "reserve"
            ? "Quantity reserved for the job"
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
      : type === "reserve"
      ? "Reserve for job"
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
                disabled={optionsLoading}
              >
                <option value="">
                  {optionsLoading ? "Loading…" : "Select product"}
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.partNo || ""} - {p.partName || ""}
                  </option>
                ))}
              </select>
              {!optionsLoading && products.length === 0 && (
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
                onChange={(e) => {
                  setRawMaterialId(
                    e.target.value === "" ? "" : Number(e.target.value)
                  );
                  setPreferredRemnantNote("");
                }}
                required
                disabled={optionsLoading}
              >
                <option value="">
                  {optionsLoading ? "Loading…" : "Select raw material"}
                </option>
                {type === "issue" ? (
                  <>
                    {issueRmGroups.onShelfRemnants.length > 0 && (
                      <optgroup label="Remnants on this shelf">
                        {issueRmGroups.onShelfRemnants.map((rm) => (
                          <option key={rm.id} value={rm.id}>
                            {rm.partNo || ""} - {rm.partName || ""}
                            {formatRmSize(rm) ? ` (${formatRmSize(rm)})` : ""}
                            {` · avail ${availableAtLocation(
                              rm.id,
                              issueLocationId,
                              balances
                            )}`}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {issueRmGroups.rest.length > 0 && (
                      <optgroup
                        label={
                          issueRmGroups.onShelfRemnants.length > 0
                            ? "Mill stock and other"
                            : "Raw materials"
                        }
                      >
                        {issueRmGroups.rest.map((rm) => (
                          <option key={rm.id} value={rm.id}>
                            {rm.isRemnant ? "Remnant · " : ""}
                            {rm.partNo || ""} - {rm.partName || ""}
                            {formatRmSize(rm) ? ` (${formatRmSize(rm)})` : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                ) : (
                  rawMaterials.map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      {rm.isRemnant ? "Remnant · " : ""}
                      {rm.partNo || ""} - {rm.partName || ""}
                      {formatRmSize(rm) ? ` (${formatRmSize(rm)})` : ""}
                    </option>
                  ))
                )}
              </select>
              {type === "issue" && (
                <p className="form-row-help">
                  {preferredRemnantNote ||
                    "Remnants already on this shelf are listed first. Shortest leftover of the same mill stock is preferred."}
                </p>
              )}
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

          {type === "issue" && materialType === "raw" && (
            <div className="form-row">
              <label>Leftover (optional)</label>
              <p className="form-row-help">
                If you cut a bar or plate and have an offcut, enter leftover size in mm. On-hand of the piece you issued drops; a remnant is put back on the same shelf. Leave blank if nothing is left.
                {selectedRawMaterial?.lengthMm != null
                  ? ` This piece is ${selectedRawMaterial.lengthMm} mm long.`
                  : ""}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginTop: "0.5rem" }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Length mm"
                  value={leftoverLengthMm}
                  onChange={(e) => setLeftoverLengthMm(e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Width mm"
                  value={leftoverWidthMm}
                  onChange={(e) => setLeftoverWidthMm(e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Thick mm"
                  value={leftoverThicknessMm}
                  onChange={(e) => setLeftoverThicknessMm(e.target.value)}
                />
              </div>
            </div>
          )}

          {type === "receive" && (
            <div className="form-row">
              <label>Lot / heat (optional)</label>
              <input
                type="text"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="e.g. H-8841"
              />
              <p className="form-row-help">
                Mill heat or vendor lot. Leave blank if you are not tracking certs on this receipt.
              </p>
            </div>
          )}

          {type === "issue" && lots.length > 0 && (
            <div className="form-row">
              <label>Lot / heat</label>
              <select
                value={lotId}
                onChange={(e) =>
                  setLotId(e.target.value === "" ? "" : Number(e.target.value))
                }
              >
                <option value="">Oldest first (FIFO)</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.lotNumber} · on hand {lot.quantityOnHand}
                  </option>
                ))}
              </select>
              <p className="form-row-help">
                Leave as oldest first unless this job needs a specific mill cert.
              </p>
            </div>
          )}

          <div className="form-row">
            <label>{type === "reserve" ? "Linked to" : "Linked to (optional)"}</label>
            <select
              value={referenceType}
              onChange={(e) => {
                setReferenceType(e.target.value);
                setReferenceId("");
              }}
            >
              {type !== "reserve" && <option value="">None</option>}
              <option value="JobOrder">Job</option>
              {type !== "reserve" && (
                <>
                  <option value="VendorReceiving">Vendor receive</option>
                  <option value="CustomerShipment">Shipment</option>
                </>
              )}
            </select>
            <p className="form-row-help">
              {type === "reserve"
                ? "Holds this qty for the job. On-hand stays the same; available drops until you issue or release."
                : type === "issue"
                ? "If linked to a job, that job’s reserved qty is used first."
                : "Records why this quantity moved. Jobs and shipments are not updated from here."}
            </p>
          </div>

          {referenceType !== "" && (
            <div className="form-row">
              <label>
                {referenceType === "JobOrder"
                  ? "Job"
                  : referenceType === "VendorReceiving"
                  ? "Vendor receive"
                  : "Shipment"}
              </label>
              <select
                value={referenceId}
                onChange={(e) =>
                  setReferenceId(e.target.value === "" ? "" : Number(e.target.value))
                }
                disabled={!documentsLoaded}
              >
                <option value="">
                  {!documentsLoaded ? "Loading…" : "Select…"}
                </option>
                {documentOptions().map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                    {opt.detail ? ` (${opt.detail})` : ""}
                  </option>
                ))}
              </select>
              {documentsLoaded && documentOptions().length === 0 && (
                <p className="form-row-help">No recent documents found.</p>
              )}
            </div>
          )}

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
