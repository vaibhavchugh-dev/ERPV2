import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { PriceBreakdownService, PriceBreakdownMaster, PriceBreakdownMasterReq } from "../../Common/Services/PriceBreakdownService";
import "./CustomerMaster.scss";

interface EditablePriceBreakdown extends PriceBreakdownMaster {
  isNew?: boolean;
}

const PriceBreakdownMasterComponent: React.FC = () => {
  const [priceBreakdowns, setPriceBreakdowns] = useState<EditablePriceBreakdown[]>([]);
  const [originalPriceBreakdowns, setOriginalPriceBreakdowns] = useState<EditablePriceBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);

  useEffect(() => {
    loadPriceBreakdowns();
  }, []);

  const loadPriceBreakdowns = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1;
      }

      const result = await PriceBreakdownService.GetPriceBreakdowns({ tenantid: tenantID });
      
      if (result && Array.isArray(result)) {
        setPriceBreakdowns(result);
        setOriginalPriceBreakdowns(JSON.parse(JSON.stringify(result)));
        setIsStateChanged(false);
      } else {
        setPriceBreakdowns([]);
        setOriginalPriceBreakdowns([]);
      }
    } catch (error: any) {
      console.error('[PriceBreakdownMaster] Error loading price breakdowns:', error);
      toast.error(`Error loading price breakdowns: ${error.message || 'Unknown error'}`);
      setPriceBreakdowns([]);
      setOriginalPriceBreakdowns([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRow = () => {
    const maxSrno = priceBreakdowns.length > 0 
      ? Math.max(...priceBreakdowns.map(p => p.srno || 0))
      : 0;
    
    const newRow: EditablePriceBreakdown = {
      id: 0,
      itemName: "",
      srno: maxSrno + 1,
      status: 1,
      statusText: "Active",
      isNew: true
    };

    setPriceBreakdowns([...priceBreakdowns, newRow]);
    setIsStateChanged(true);
  };

  const handleDeleteRow = (index: number) => {
    const item = priceBreakdowns[index];
    if (item.isNew) {
      // Just remove from list if it's a new row
      const updated = priceBreakdowns.filter((_, i) => i !== index);
      setPriceBreakdowns(updated);
      setIsStateChanged(updated.length !== originalPriceBreakdowns.length || 
        JSON.stringify(updated) !== JSON.stringify(originalPriceBreakdowns));
    } else {
      // Confirm deletion for existing rows
      if (window.confirm("Are you sure you want to delete this item?")) {
        const updated = priceBreakdowns.filter((_, i) => i !== index);
        setPriceBreakdowns(updated);
        setIsStateChanged(true);
      }
    }
  };

  const handleInputChange = (index: number, field: keyof EditablePriceBreakdown, value: any) => {
    const updated = [...priceBreakdowns];
    updated[index] = { ...updated[index], [field]: value };
    
    // Update statusText when status changes
    if (field === 'status') {
      updated[index].statusText = value === 1 ? "Active" : "Inactive";
    }
    
    setPriceBreakdowns(updated);
    setIsStateChanged(true);
  };

  const handleStatusToggle = (index: number) => {
    const currentStatus = priceBreakdowns[index].status;
    handleInputChange(index, 'status', currentStatus === 1 ? 0 : 1);
  };

  const handleSave = async () => {
    // Validate all rows
    const emptyRows = priceBreakdowns.filter(p => !p.itemName || p.itemName.trim() === "");
    if (emptyRows.length > 0) {
      toast.error("Please fill in all item names");
      return;
    }

    // Check for duplicates
    const itemNames = priceBreakdowns.map(p => p.itemName?.toLowerCase().trim());
    const duplicates = itemNames.filter((name, index) => itemNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      toast.error("Duplicate item names are not allowed");
      return;
    }

    setSaving(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;

      const requestData: PriceBreakdownMasterReq[] = priceBreakdowns.map(p => ({
        Id: p.id,
        ItemName: p.itemName || "",
        Srno: p.srno,
        Status: p.status === 1 ? "Active" : "Inactive",
        Tenantid: tenantID
      }));

      await PriceBreakdownService.SavePriceBreakdowns(requestData);
      toast.success("Price breakdowns saved successfully");
      setIsStateChanged(false);
      loadPriceBreakdowns();
    } catch (error: any) {
      console.error("Error saving price breakdowns:", error);
      toast.error(`Error saving price breakdowns: ${error.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (window.confirm("Are you sure you want to discard all changes?")) {
      setPriceBreakdowns(JSON.parse(JSON.stringify(originalPriceBreakdowns)));
      setIsStateChanged(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading price breakdowns...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Price Breakdown Master</h1>
          <p className="page-subtitle">Manage your price breakdown items</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={handleAddRow}>
            <span>+</span>
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Price Breakdowns Table */}
      <div className="table-card">
        <div className="table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                <th style={{ width: "80px" }}>Sr. No.</th>
                <th>Item Name</th>
                <th style={{ width: "100px", textAlign: "center" }}>Active</th>
                <th style={{ width: "80px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {priceBreakdowns.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-state">
                    <p>No price breakdown items found</p>
                    <small>Click "Add Item" to get started</small>
                  </td>
                </tr>
              ) : (
                priceBreakdowns.map((priceBreakdown, index) => (
                  <tr key={priceBreakdown.id || `new-${index}`}>
                    <td>{priceBreakdown.srno || index + 1}</td>
                    <td>
                      <input
                        type="text"
                        className="form-input"
                        style={{ 
                          width: "100%", 
                          padding: "0.625rem 0.75rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "0.375rem",
                          fontSize: "0.875rem",
                          color: "#111827",
                          backgroundColor: "#ffffff",
                          transition: "all 0.15s"
                        }}
                        value={priceBreakdown.itemName || ""}
                        onChange={(e) => handleInputChange(index, 'itemName', e.target.value)}
                        onFocus={(e) => {
                          e.target.style.borderColor = "#6366f1";
                          e.target.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.1)";
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = "#d1d5db";
                          e.target.style.boxShadow = "none";
                        }}
                        placeholder="Enter item name"
                        maxLength={500}
                      />
                    </td>
                    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                      <label style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        cursor: "pointer",
                        gap: "0.5rem",
                        margin: 0
                      }}>
                        <input
                          type="checkbox"
                          checked={priceBreakdown.status === 1}
                          onChange={() => handleStatusToggle(index)}
                          style={{ 
                            width: "18px", 
                            height: "18px", 
                            cursor: "pointer",
                            margin: 0
                          }}
                        />
                      </label>
                    </td>
                    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRow(index);
                        }}
                        className="btn-icon btn-icon-danger"
                        style={{
                          padding: "0.25rem 0.5rem",
                          fontSize: "0.875rem",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                        title="Delete"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer with Save/Discard buttons */}
      {isStateChanged && (
        <div style={{
          marginTop: "1.5rem",
          padding: "1rem 1.5rem",
          backgroundColor: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
        }}>
          <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            You have unsaved changes
          </span>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={handleDiscard}
              className="btn-cancel"
              disabled={saving}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn-submit"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceBreakdownMasterComponent;
