import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { LocationService, LocationMaster } from "../../Common/Services/LocationService";
import ColumnChooser from "../../Common/Components/ColumnChooser";
import { ColumnDefinition, useColumnChooser } from "../../Common/Hooks/useColumnChooser";
import LocationMasterSlideout from "./LocationMasterSlideout";
import "./CustomerMaster.scss";

const COLUMNS: ColumnDefinition[] = [
  { key: "code", label: "Code", sortKey: "code", locked: true },
  { key: "name", label: "Name", sortKey: "name", locked: true },
  { key: "locTypeName", label: "Type", sortKey: "locTypeName" },
  { key: "displayPath", label: "Path", sortKey: "displayPath" },
  { key: "parentName", label: "Parent", sortKey: "parentName" },
  { key: "address", label: "Address", sortKey: "address" },
  { key: "city", label: "City", sortKey: "city" },
  { key: "state", label: "State", sortKey: "state" },
  { key: "country", label: "Country", sortKey: "country" },
  { key: "email", label: "Email", sortKey: "email" },
  { key: "phone", label: "Phone", sortKey: "phone" },
  { key: "status", label: "Status", sortKey: "status" },
];

const DEFAULT_HIDDEN_COLUMNS = ["address", "city", "state", "country", "email", "phone"];
const COLUMN_PREFERENCE_KEY = "locationMaster.hiddenColumns";

const LocationMasterComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [sortColumn, setSortColumn] = useState<keyof LocationMaster | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const {
    hiddenColumns,
    visibleColumns,
    showColumnChooser,
    setShowColumnChooser,
    columnChooserRef,
    toggleColumn,
  } = useColumnChooser(COLUMN_PREFERENCE_KEY, COLUMNS, DEFAULT_HIDDEN_COLUMNS);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedLocationId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      // For development: if tenantID is not set, use a default value
      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1; // Default tenant ID for development
        console.log('[LocationMaster] Using default tenantID:', tenantID);
      }

      console.log('[LocationMaster] Loading locations with tenantID:', tenantID);
      const result = await LocationService.GetLocations({ tenantid: tenantID });
      console.log('[LocationMaster] API response:', result);
      
      if (result && Array.isArray(result)) {
        setLocations(result);
        console.log('[LocationMaster] Loaded', result.length, 'locations');
      } else {
        console.warn('[LocationMaster] Invalid response from API:', result);
        setLocations([]);
      }
    } catch (error: any) {
      console.error('[LocationMaster] Error loading locations:', error);
      toast.error(`Error loading locations: ${error.message || 'Unknown error'}`);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (location: LocationMaster) => {
    setSelectedLocationId(location.locationId);
    setShowSlideout(true);
  };

  const handleAddLocation = () => {
    setSelectedLocationId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = (refreshList = false) => {
    setShowSlideout(false);
    if (refreshList) {
      loadLocations();
    }
  };

  const handleSort = (column: keyof LocationMaster) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredLocations = locations.filter((location) => {
    const matchesSearch =
      location.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.state?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.country?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (location.displayPath || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (location.locTypeName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (location.parentName || "").toLowerCase().includes(searchTerm.toLowerCase());

    if (filterValue === "all") {
      return matchesSearch;
    }

    if (filterValue === "active") {
      return matchesSearch && location.status === "Active";
    }

    if (filterValue === "inactive") {
      return matchesSearch && location.status === "Inactive";
    }

    return matchesSearch;
  });

  const sortedLocations = [...filteredLocations].sort((a, b) => {
    if (!sortColumn) return 0;

    let aValue: any = a[sortColumn];
    let bValue: any = b[sortColumn];

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    if (typeof aValue === "string" && typeof bValue === "string") {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const getSortIcon = (column: keyof LocationMaster) => {
    if (sortColumn !== column) {
      return <span className="sort-icon inactive">⇅</span>;
    }
    return sortDirection === "asc" ? (
      <span className="sort-icon active">↑</span>
    ) : (
      <span className="sort-icon active">↓</span>
    );
  };

  const renderCell = (location: LocationMaster, key: string): React.ReactNode => {
    switch (key) {
      case "code":
        return location.code || "";
      case "name":
        return location.name || "";
      case "locTypeName":
        return location.locTypeName || "—";
      case "displayPath":
        return location.displayPath || "—";
      case "parentName":
        return location.parentName || "—";
      case "address":
        return location.address || "";
      case "city":
        return location.city || "";
      case "state":
        return location.state || "";
      case "country":
        return location.country || "";
      case "email":
        return location.email || "";
      case "phone":
        return location.phone || "";
      case "status":
        return (
          <span
            className={`badge ${
              location.status === "Active" ? "badge-success" : "badge-danger"
            }`}
          >
            {location.status || ""}
          </span>
        );
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading locations...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Location Master</h1>
          <p className="page-subtitle">
            Business sites (plants/branches) and storage locations — warehouses, racks, shelves, bins — in one hierarchy.
          </p>
        </div>
        <div className="page-actions">
          <ColumnChooser
            columns={COLUMNS}
            hiddenColumns={hiddenColumns}
            showMenu={showColumnChooser}
            onToggleMenu={() => setShowColumnChooser(!showColumnChooser)}
            onToggleColumn={toggleColumn}
            containerRef={columnChooserRef}
          />
          <button className="btn-primary" onClick={handleAddLocation}>
            <span>+</span>
            <span>Add Location</span>
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="page-filters">
        <div className="search-wrapper">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input
            type="text"
            placeholder="Search locations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          <select
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Locations</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Locations Table */}
      <div className="table-card">
        <div className="table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    className={column.sortKey ? "sortable" : ""}
                    onClick={() =>
                      column.sortKey &&
                      handleSort(column.sortKey as keyof LocationMaster)
                    }
                  >
                    <div className="th-content">
                      {column.label}
                      {column.sortKey &&
                        getSortIcon(column.sortKey as keyof LocationMaster)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedLocations.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="empty-state">
                    <p>No locations found</p>
                    <small>Click "Add Location" to get started</small>
                  </td>
                </tr>
              ) : (
                sortedLocations.map((location) => (
                  <tr key={location.locationId} onClick={() => handleRowClick(location)}>
                    {visibleColumns.map((column) => (
                      <td
                        key={column.key}
                        style={
                          column.key === "displayPath"
                            ? {
                                maxWidth: "280px",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }
                            : undefined
                        }
                        title={column.key === "displayPath" ? location.displayPath : undefined}
                      >
                        {renderCell(location, column.key)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSlideout && (
        <LocationMasterSlideout
          locationId={selectedLocationId}
          onClose={handleCloseSlideout}
        />
      )}
    </div>
  );
};

export default LocationMasterComponent;
