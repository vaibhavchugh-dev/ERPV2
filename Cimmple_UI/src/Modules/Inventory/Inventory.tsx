import React, { useState, useEffect, useRef } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  InventoryService,
  InventoryBalance,
  InventoryTransaction,
  InventoryReservation,
  LowStockAlert,
  getTenantId,
} from "../../Common/Services/InventoryService";
import { LocationService } from "../../Common/Services/LocationService";
import { useActiveLocation } from "../../Common/Hooks/useActiveLocation";
import { formatDateOnlyFromApi } from "../../Common/Utils/Formatting";
import StockMovementModal from "./StockMovementModal";
import "./Inventory.scss";

type MovementType = "receive" | "issue" | "transfer" | "adjust" | "reserve" | null;
type RowActionKey = Exclude<MovementType, null> | "history";

const ROW_ACTIONS: { key: RowActionKey; label: string }[] = [
  { key: "receive", label: "Receive" },
  { key: "issue", label: "Issue" },
  { key: "reserve", label: "Reserve" },
  { key: "transfer", label: "Transfer" },
  { key: "adjust", label: "Adjust" },
  { key: "history", label: "History" },
];

const InventoryRowActions: React.FC<{
  onAction: (key: RowActionKey) => void;
}> = ({ onAction }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="row-action-menu" ref={menuRef}>
      <button
        type="button"
        className="row-action-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Row actions"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="row-action-dropdown" role="menu">
          {ROW_ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              className="row-action-item"
              onClick={() => {
                setOpen(false);
                onAction(action.key);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Inventory: React.FC = () => {
  const history = useHistory();
  const { locationId: activeLocationId } = useActiveLocation();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [alerts, setAlerts] = useState<LowStockAlert[]>([]);
  const [locations, setLocations] = useState<{ locationId: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState<number | "">(
    () => (activeLocationId > 0 ? activeLocationId : "")
  );
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<MovementType>(null);
  const [selectedBalance, setSelectedBalance] = useState<InventoryBalance | null>(null);
  const [movements, setMovements] = useState<InventoryTransaction[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [itemMovements, setItemMovements] = useState<InventoryTransaction[] | null>(null);
  const [historyBalance, setHistoryBalance] = useState<InventoryBalance | null>(null);

  // Keep inventory filter aligned with TopBar working site.
  useEffect(() => {
    if (activeLocationId > 0) {
      setLocationFilter(activeLocationId);
    }
  }, [activeLocationId]);

  useEffect(() => {
    loadData();
  }, [locationFilter, lowStockOnly]);

  const loadData = async () => {
    setLoading(true);
    try {
      const tenantId = getTenantId();

      const [balanceResult, alertsResult, locationsResult, historyResult, reservationResult] =
        await Promise.all([
        InventoryService.GetBalanceList({
          locationId: locationFilter || undefined,
          lowStockOnly: lowStockOnly || undefined,
        }),
        InventoryService.GetLowStockAlerts({
          locationId: locationFilter || undefined,
        }),
        LocationService.GetLocations({ tenantid: tenantId }),
        InventoryService.GetTransactionHistory({
          locationId: locationFilter || undefined,
          limit: 50,
        }),
        InventoryService.GetReservations({
          locationId: locationFilter || undefined,
        }),
      ]);

      setBalances(balanceResult || []);
      setAlerts(alertsResult || []);
      setMovements(historyResult || []);
      setReservations(reservationResult || []);
      setLocations(
        (locationsResult || []).map((l: any) => ({
          locationId: l.locationId,
          name: l.name || l.code || "",
        }))
      );
    } catch (error: any) {
      toast.error(`Error loading inventory: ${error.message || "Unknown error"}`);
      setBalances([]);
      setAlerts([]);
      setMovements([]);
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMovement = (type: MovementType, balance?: InventoryBalance) => {
    setMovementType(type);
    setSelectedBalance(balance || null);
    setShowMovementModal(true);
  };

  const handleCloseMovement = () => {
    setShowMovementModal(false);
    setMovementType(null);
    setSelectedBalance(null);
  };

  const handleMovementSuccess = () => {
    handleCloseMovement();
    loadData();
  };

  const handleOpenHistory = async (balance: InventoryBalance) => {
    setHistoryBalance(balance);
    try {
      const rows = await InventoryService.GetTransactionHistory({
        productId: balance.productId || undefined,
        rawMaterialId: balance.rawMaterialId || undefined,
        locationId: balance.locationId,
        limit: 80,
      });
      setItemMovements(rows || []);
    } catch {
      setItemMovements([]);
    }
  };

  const handleClearHistoryFilter = () => {
    setHistoryBalance(null);
    setItemMovements(null);
  };

  const handleReleaseReservation = async (reservation: InventoryReservation) => {
    const result = await InventoryService.ReleaseReservation(reservation.id);
    if (result.success) {
      toast.success("Reservation released");
      loadData();
    } else {
      toast.error(result.error || "Could not release reservation");
    }
  };

  const visibleMovements = historyBalance ? itemMovements || [] : movements;

  const formatMovementWhen = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return formatDateOnlyFromApi(iso) || "—";
    return d.toLocaleString(undefined, {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const movementPart = (m: InventoryTransaction) =>
    m.productPartNo || m.rawMaterialPartNo || m.productName || m.rawMaterialName || "—";

  const movementWhy = (m: InventoryTransaction) => m.referenceLabel || m.notes || "—";

  const familyKey = (b: InventoryBalance) => {
    if (b.productId) return `P:${b.productPartNo || b.productId}`;
    if (b.isRemnant)
      return `R:${b.parentPartNo || b.parentRawMaterialId || b.rawMaterialPartNo || ""}`;
    return `R:${b.rawMaterialPartNo || b.rawMaterialId || ""}`;
  };

  const filteredBalances = balances
    .filter((b) => {
      const partNo = b.productPartNo || b.rawMaterialPartNo || "";
      const partName = b.productName || b.rawMaterialName || "";
      const locName = b.locationName || "";
      return (
        partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        partName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        locName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    })
    .slice()
    .sort((a, b) => {
      const loc = (a.locationName || "").localeCompare(b.locationName || "");
      if (loc !== 0) return loc;
      const fam = familyKey(a).localeCompare(familyKey(b));
      if (fam !== 0) return fam;
      if (!!a.isRemnant !== !!b.isRemnant) return a.isRemnant ? -1 : 1;
      const aLen = a.lengthMm ?? Number.POSITIVE_INFINITY;
      const bLen = b.lengthMm ?? Number.POSITIVE_INFINITY;
      if (aLen !== bLen) return aLen - bLen;
      return (a.rawMaterialPartNo || a.productPartNo || "").localeCompare(
        b.rawMaterialPartNo || b.productPartNo || ""
      );
    });

  const fallbackProducts = Array.from(
    balances.reduce((acc, b) => {
      if (!b.productId) return acc;
      acc.set(b.productId, {
        id: b.productId,
        partNo: b.productPartNo || `Product #${b.productId}`,
        partName: b.productName || "",
      });
      return acc;
    }, new Map<number, { id: number; partNo?: string; partName?: string }>())
  ).map(([, value]) => value);

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading inventory...</p>
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Manage stock levels and movements</p>
        </div>
        <div className="page-actions">
          <button
            className="btn-secondary"
            onClick={() => history.push("/masters/raw-material")}
          >
            <span>RM</span>
            <span>Raw Material Master</span>
          </button>
          <button
            className="btn-primary"
            onClick={() => handleOpenMovement("receive")}
          >
            <span>+</span>
            <span>Receive</span>
          </button>
          <button
            className="btn-secondary"
            onClick={() => handleOpenMovement("issue")}
          >
            <span>−</span>
            <span>Issue</span>
          </button>
          <button
            className="btn-secondary"
            onClick={() => handleOpenMovement("reserve")}
          >
            <span>◎</span>
            <span>Reserve</span>
          </button>
          <button
            className="btn-secondary"
            onClick={() => handleOpenMovement("transfer")}
          >
            <span>↔</span>
            <span>Transfer</span>
          </button>
          <button
            className="btn-secondary"
            onClick={() => handleOpenMovement("adjust")}
          >
            <span>±</span>
            <span>Adjust</span>
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alerts-banner">
          <strong>Low Stock:</strong> {alerts.length} item(s) below reorder point
        </div>
      )}

      <div className="page-filters">
        <div className="search-wrapper">
          <svg
            width="18"
            height="18"
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
            placeholder="Search part number, name, location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group inventory-location-filter">
          <select
            value={locationFilter}
            onChange={(e) =>
              setLocationFilter(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="filter-select"
            aria-label="Filter by location"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.locationId} value={loc.locationId}>
                {loc.name}
                {activeLocationId === loc.locationId ? " (working site)" : ""}
              </option>
            ))}
          </select>
        </div>
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />
          Low stock only
        </label>
      </div>

      <div className="table-card">
        <div className="table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Part No</th>
                <th>Part Name</th>
                <th>Location</th>
                <th className="text-right">On Hand</th>
                <th className="text-right">Reserved</th>
                <th className="text-right">Available</th>
                <th className="text-right">Reorder Point</th>
                <th>Type</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBalances.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-state">
                    <p>No inventory records found</p>
                    <small>Use Receive to add stock</small>
                  </td>
                </tr>
              ) : (
                filteredBalances.map((b) => (
                  <tr key={b.id}>
                    <td className="part-no">
                      {b.productPartNo || b.rawMaterialPartNo || "—"}
                    </td>
                    <td className="part-name">
                      <span className="part-name-text">
                        {b.productName || b.rawMaterialName || "—"}
                      </span>
                      {b.isRemnant && (
                        <span className="part-name-sub">
                          {b.parentPartNo ? `From ${b.parentPartNo}` : "Offcut"}
                          {b.lengthMm != null || b.widthMm != null || b.thicknessMm != null
                            ? ` · ${[b.thicknessMm, b.widthMm, b.lengthMm]
                                .filter((n) => n != null)
                                .join("×")} mm`
                            : ""}
                        </span>
                      )}
                    </td>
                    <td>{b.locationName || "—"}</td>
                    <td className="text-right">{b.quantityOnHand}</td>
                    <td className="text-right">{b.quantityReserved}</td>
                    <td className="text-right">{b.quantityAvailable}</td>
                    <td className="text-right">
                      {b.reorderPoint != null ? b.reorderPoint : "—"}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          b.productId
                            ? "badge-product"
                            : b.isRemnant
                            ? "badge-remnant"
                            : "badge-raw"
                        }`}
                      >
                        {b.productId ? "Product" : b.isRemnant ? "Remnant" : "Raw Material"}
                      </span>
                    </td>
                    <td className="actions-col">
                      <InventoryRowActions
                        onAction={(key) => {
                          if (key === "history") {
                            handleOpenHistory(b);
                          } else {
                            handleOpenMovement(key, b);
                          }
                        }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-card movement-history-card">
        <div className="movement-history-header">
          <div>
            <h2>Open reservations</h2>
            <p>Qty held for a job. Still on the shelf; not available for others.</p>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Location</th>
                <th>Job</th>
                <th className="text-right">Qty</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reservations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    <p>No open reservations</p>
                    <small>Use Reserve to hold qty for a job</small>
                  </td>
                </tr>
              ) : (
                reservations.map((r) => (
                  <tr key={r.id}>
                    <td className="part-no">
                      {r.partNo || "—"}
                      {r.partName ? (
                        <div className="part-name" style={{ fontWeight: 400, color: "#6b7280", fontSize: "0.75rem" }}>
                          {r.partName}
                        </div>
                      ) : null}
                    </td>
                    <td>{r.locationName || "—"}</td>
                    <td>{r.jobLabel || "—"}</td>
                    <td className="text-right">{r.quantity}</td>
                    <td className="actions-col">
                      <button
                        className="btn-small"
                        onClick={() => handleReleaseReservation(r)}
                      >
                        Release
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-card movement-history-card">
        <div className="movement-history-header">
          <div>
            <h2>Recent movements</h2>
            <p>
              {historyBalance
                ? `History for ${
                    historyBalance.productPartNo ||
                    historyBalance.rawMaterialPartNo ||
                    historyBalance.productName ||
                    historyBalance.rawMaterialName ||
                    "this item"
                  } at ${historyBalance.locationName || "location"}`
                : "What moved, where, how much, and why"}
            </p>
          </div>
          {historyBalance && (
            <button className="btn-secondary" onClick={handleClearHistoryFilter}>
              Show all
            </button>
          )}
        </div>
        <div className="table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Part</th>
                <th>Location</th>
                <th className="text-right">Qty</th>
                <th>Lot / heat</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {visibleMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    <p>No movements yet</p>
                    <small>Receive, issue, transfer, or adjust stock to see history here</small>
                  </td>
                </tr>
              ) : (
                visibleMovements.map((m) => (
                  <tr key={m.id}>
                    <td>{formatMovementWhen(m.transactionDate)}</td>
                    <td>{m.transactionTypeName || m.transactionType || "—"}</td>
                    <td className="part-no">{movementPart(m)}</td>
                    <td>{m.locationName || "—"}</td>
                    <td
                      className={`text-right ${
                        m.quantity < 0 ? "qty-out" : "qty-in"
                      }`}
                    >
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td>{m.lotNumber || "—"}</td>
                    <td>
                      {movementWhy(m)}
                      {m.referenceLabel && m.notes ? (
                        <div className="movement-notes">{m.notes}</div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showMovementModal && movementType && (
        <StockMovementModal
          type={movementType}
          balance={selectedBalance}
          balances={balances}
          fallbackProducts={fallbackProducts}
          locations={locations}
          defaultLocationId={activeLocationId}
          onClose={handleCloseMovement}
          onSuccess={handleMovementSuccess}
        />
      )}
    </div>
  );
};

export default Inventory;
