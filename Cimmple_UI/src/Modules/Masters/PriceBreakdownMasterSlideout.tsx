import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  PriceBreakdownService,
  PriceBreakdownMasterReq,
} from "../../Common/Services/PriceBreakdownService";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import "./CustomerMasterSlideout.scss";

interface PriceBreakdownMasterSlideoutProps {
  priceBreakdownId: number;
  onClose: () => void;
}

const PriceBreakdownMasterSlideout: React.FC<PriceBreakdownMasterSlideoutProps> = ({
  priceBreakdownId,
  onClose,
}) => {
  const [formData, setFormData] = useState<PriceBreakdownMasterReq>({
    Id: 0,
    ItemName: "",
    Srno: 0,
    Status: "Active",
    Tenantid: 0,
  });

  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({
      ...prev,
      Tenantid: storage?.tenantID || 0,
    }));

    if (priceBreakdownId > 0) {
      loadPriceBreakdown();
    } else {
      loadNextSequenceNumber();
    }
  }, [priceBreakdownId]);

  const loadNextSequenceNumber = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const priceBreakdowns = await PriceBreakdownService.GetPriceBreakdowns({ tenantid: tenantID });
      if (priceBreakdowns && priceBreakdowns.length > 0) {
        const maxSrno = Math.max(...priceBreakdowns.map(p => p.srno || 0));
        setFormData((prev) => ({
          ...prev,
          Srno: maxSrno + 1,
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          Srno: 1,
        }));
      }
    } catch (error) {
      setFormData((prev) => ({
        ...prev,
        Srno: 1,
      }));
    }
  };

  const loadPriceBreakdown = async () => {
    setLoading(true);
    try {
      const priceBreakdown = await PriceBreakdownService.GetPriceBreakdownById(priceBreakdownId);
      if (priceBreakdown) {
        setFormData({
          Id: priceBreakdown.Id,
          ItemName: priceBreakdown.ItemName || "",
          Srno: priceBreakdown.Srno || 0,
          Status: priceBreakdown.Status || "Active",
          Tenantid: priceBreakdown.Tenantid,
        });
      }
    } catch (error: any) {
      console.error("Error loading price breakdown:", error);
      toast.error(`Error loading price breakdown: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof PriceBreakdownMasterReq, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsStateChanged(true);

    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.ItemName || formData.ItemName.trim() === "") {
      newErrors.ItemName = "Item name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    setLoading(true);
    try {
      // Save as array (single item)
      await PriceBreakdownService.SavePriceBreakdowns([formData]);
      toast.success(
        priceBreakdownId > 0
          ? "Price breakdown updated successfully"
          : "Price breakdown created successfully"
      );
      setIsStateChanged(false);
      onClose();
    } catch (error: any) {
      console.error("Error saving price breakdown:", error);
      toast.error(`Error saving price breakdown: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (isStateChanged) {
      if (window.confirm("You have unsaved changes. Are you sure you want to cancel?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (loading && priceBreakdownId > 0) {
    return (
      <div className="slideout-overlay">
        <div className="form-card">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="slideout-overlay" onClick={handleCancel}>
      <div className="form-card" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>{priceBreakdownId > 0 ? "Edit Price Breakdown" : "Add New Price Breakdown"}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className="status-field-inline">
              <div className={`input-group ${formData.Status === 'Active' ? 'status-active-group' : 'status-inactive-group'}`} style={{ maxWidth: '150px' }}>
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                  </span>
                </div>
                <select
                  id="Status"
                  name="Status"
                  className={`form-input ${formData.Status === 'Active' ? 'status-active' : 'status-inactive'}`}
                  value={formData.Status}
                  onChange={(e) => handleInputChange("Status", e.target.value)}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <button type="button" className="btn-close" onClick={handleCancel}>
              ×
            </button>
          </div>
        </div>

        <form className="airframe-form" onSubmit={handleSubmit}>
          <div className="tab-content">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="Srno">Sequence Number</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <input
                    type="number"
                    id="Srno"
                    name="Srno"
                    className="form-input"
                    placeholder="Enter sequence number"
                    value={formData.Srno}
                    onChange={(e) => handleInputChange("Srno", parseInt(e.target.value) || 0)}
                    min="1"
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="ItemName">Item Name <span className="required">*</span></label>
                <div className={`input-group ${errors.ItemName ? 'has-error' : ''}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="ItemName"
                    name="ItemName"
                    className={`form-input ${errors.ItemName ? "error" : ""}`}
                    placeholder="Enter item name"
                    value={formData.ItemName}
                    onChange={(e) => handleInputChange("ItemName", e.target.value)}
                    required
                  />
                </div>
                {errors.ItemName && <span className="error-message">{errors.ItemName}</span>}
              </div>
            </div>
          </div>

          <div className="form-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Saving..." : priceBreakdownId > 0 ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PriceBreakdownMasterSlideout;

