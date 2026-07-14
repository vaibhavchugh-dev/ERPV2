import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { VendorService, VendorMaster } from "../../Common/Services/VendorService";
import VendorMasterSlideout from "./VendorMasterSlideout";
import "./CustomerMaster.scss";

const VendorMasterComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [vendors, setVendors] = useState<VendorMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [sortColumn, setSortColumn] = useState<keyof VendorMaster | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    loadVendors();
  }, []);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedVendorId(id);
        setShowSlideout(true);
        // Clean up URL
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  // Listen for custom event from global search
  useEffect(() => {
    const handleOpenEntity = (event: CustomEvent) => {
      if (event.detail.type === 'vendor') {
        setSelectedVendorId(event.detail.id);
        setShowSlideout(true);
      }
    };

    window.addEventListener('openEntity', handleOpenEntity as EventListener);
    return () => {
      window.removeEventListener('openEntity', handleOpenEntity as EventListener);
    };
  }, []);

  const loadVendors = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === "development") {
        tenantID = 1;
      }

      const result = await VendorService.GetVendorlist({ tenantid: tenantID });
      if (result) {
        setVendors(result);
      }
    } catch (error: any) {
      toast.error(`Error loading vendors: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (vendor: VendorMaster) => {
    setSelectedVendorId(vendor.vendor_id);
    setShowSlideout(true);
  };

  const handleAddVendor = () => {
    setSelectedVendorId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = () => {
    setShowSlideout(false);
    loadVendors();
  };

  const handleSort = (column: keyof VendorMaster) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredVendors = vendors.filter((vendor) => {
    const matchesSearch =
      vendor.vendorcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.fullAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.phone_number?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterValue === "all") {
      return matchesSearch;
    }

    if (filterValue === "active") {
      return matchesSearch && vendor.status === "Active";
    }

    if (filterValue === "inactive") {
      return matchesSearch && vendor.status === "Inactive";
    }

    return matchesSearch;
  });

  const sortedVendors = [...filteredVendors].sort((a, b) => {
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

  const getSortIcon = (column: keyof VendorMaster) => {
    if (sortColumn !== column) {
      return <span className="sort-icon inactive">⇅</span>;
    }
    return sortDirection === "asc" ? (
      <span className="sort-icon active">↑</span>
    ) : (
      <span className="sort-icon active">↓</span>
    );
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading vendors...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Vendor Master</h1>
          <p className="page-subtitle">Manage your vendor database</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={handleAddVendor}>
            <span>+</span>
            <span>Add Vendor</span>
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
            placeholder="Search vendors..."
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
            <option value="all">All Vendors</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Vendors Table */}
      <div className="table-card">
        <div className="table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                <th
                  className="sortable"
                  onClick={() => handleSort("vendorcode" as keyof VendorMaster)}
                >
                  <div className="th-content">
                    Vendor Code
                    {getSortIcon("vendorcode" as keyof VendorMaster)}
                  </div>
                </th>
                <th
                  className="sortable"
                  onClick={() => handleSort("company_name" as keyof VendorMaster)}
                >
                  <div className="th-content">
                    Vendor Name
                    {getSortIcon("company_name" as keyof VendorMaster)}
                  </div>
                </th>
                <th onClick={() => handleSort("fullAddress" as keyof VendorMaster)}>
                  <div className="th-content">
                    Address
                    {getSortIcon("fullAddress" as keyof VendorMaster)}
                  </div>
                </th>
                <th>Contact Person</th>
                <th>Contact Phone</th>
                <th
                  className="sortable"
                  onClick={() => handleSort("status" as keyof VendorMaster)}
                >
                  <div className="th-content">
                    Status
                    {getSortIcon("status" as keyof VendorMaster)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedVendors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    <p>No vendors found</p>
                    <small>Click "Add Vendor" to get started</small>
                  </td>
                </tr>
              ) : (
                sortedVendors.map((vendor) => (
                  <tr key={vendor.vendor_id} onClick={() => handleRowClick(vendor)}>
                    <td>{vendor.vendorcode || ""}</td>
                    <td>
                      <div className="customer-name">
                        <strong>{vendor.company_name}</strong>
                      </div>
                    </td>
                    <td>{vendor.fullAddress || ""}</td>
                    <td>{vendor.contactPerson || ""}</td>
                    <td>{vendor.phone_number || ""}</td>
                    <td>
                      <span
                        className={`badge ${
                          vendor.status === "Active" ? "badge-success" : "badge-danger"
                        }`}
                      >
                        {vendor.status || ""}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSlideout && (
        <VendorMasterSlideout
          vendorId={selectedVendorId}
          onClose={handleCloseSlideout}
        />
      )}
    </div>
  );
};

export default VendorMasterComponent;

export {};



