import React, { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  InventoryService,
  InventoryBalance,
  LowStockAlert,
  getTenantId,
} from "../../Common/Services/InventoryService";
import { LocationService } from "../../Common/Services/LocationService";
import StockMovementModal from "./StockMovementModal";
import "./Inventory.scss";

type MovementType = "receive" | "issue" | "transfer" | "adjust" | null;

const Inventory: React.FC = () => {
  const history = useHistory();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [alerts, setAlerts] = useState<LowStockAlert[]>([]);
  const [locations, setLocations] = useState<{ locationId: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState<number | "">("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<MovementType>(null);
  const [selectedBalance, setSelectedBalance] = useState<InventoryBalance | null>(null);

  useEffect(() => {
    loadData();
  }, [locationFilter, lowStockOnly]);

  const loadData = async () => {
    setLoading(true);
    try {
      const tenantId = getTenantId();

      const [balanceResult, alertsResult, locationsResult] = await Promise.all([
        InventoryService.GetBalanceList({
          locationId: locationFilter || undefined,
          lowStockOnly: lowStockOnly || undefined,
        }),
        InventoryService.GetLowStockAlerts(),
        LocationService.GetLocations({ tenantid: tenantId }),
      ]);

      setBalances(balanceResult || []);
      setAlerts(alertsResult || []);
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
    loadData();
  };

  const filteredBalances = balances.filter((b) => {
    const partNo = b.productPartNo || b.rawMaterialPartNo || "";
    const partName = b.productName || b.rawMaterialName || "";
    const locName = b.locationName || "";
    const match =
      partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      partName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      locName.toLowerCase().includes(searchTerm.toLowerCase());
    return match;
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
        <div className="filter-group">
          <select
            value={locationFilter}
            onChange={(e) =>
              setLocationFilter(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="filter-select"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.locationId} value={loc.locationId}>
                {loc.name}
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
                <th>Actions</th>
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
                    <td>{b.productPartNo || b.rawMaterialPartNo || "—"}</td>
                    <td>{b.productName || b.rawMaterialName || "—"}</td>
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
                          b.productId ? "badge-product" : "badge-raw"
                        }`}
                      >
                        {b.productId ? "Product" : "Raw Material"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-small"
                        onClick={() => handleOpenMovement("receive", b)}
                      >
                        Receive
                      </button>
                      <button
                        className="btn-small"
                        onClick={() => handleOpenMovement("issue", b)}
                      >
                        Issue
                      </button>
                      <button
                        className="btn-small"
                        onClick={() => handleOpenMovement("transfer", b)}
                      >
                        Transfer
                      </button>
                      <button
                        className="btn-small"
                        onClick={() => handleOpenMovement("adjust", b)}
                      >
                        Adjust
                      </button>
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
          fallbackProducts={fallbackProducts}
          locations={locations}
          onClose={handleCloseMovement}
          onSuccess={handleCloseMovement}
        />
      )}
    </div>
  );
};

export default Inventory;
