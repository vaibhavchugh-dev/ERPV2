import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { NCRCodeService, NCRCodeMasterReq } from "../../Common/Services/NCRCodeService";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "./CustomerMasterSlideout.scss";

interface NCRCodeMasterSlideoutProps {
  ncrCodeId: number;
  onClose: (refreshList?: boolean) => void;
}

const emptyForm = (): NCRCodeMasterReq => ({
  Id: 0,
  NCRCode: "",
  Description: "",
  TenantId: 0,
  CreatedBy: 0,
});

const NCRCodeMasterSlideout: React.FC<NCRCodeMasterSlideoutProps> = ({ ncrCodeId, onClose }) => {
  const [formData, setFormData] = useState<NCRCodeMasterReq>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantId = storage?.tenantID || (process.env.NODE_ENV === "development" ? 1 : 0);
    const userId = storage?.userID || storage?.userId || 0;
    setFormData((prev) => ({
      ...prev,
      TenantId: tenantId,
      CreatedBy: userId,
    }));

    if (ncrCodeId > 0) {
      loadCode(tenantId);
    } else {
      setFormData((prev) => ({ ...emptyForm(), TenantId: tenantId, CreatedBy: userId }));
    }
  }, [ncrCodeId]);

  const loadCode = async (tenantId: number) => {
    setLoading(true);
    try {
      const code = await NCRCodeService.GetNCRCodeById(ncrCodeId, tenantId);
      if (code) {
        setFormData({
          Id: code.id,
          NCRCode: code.ncrCode || "",
          Description: code.description || "",
          TenantId: code.tenantId,
          CreatedBy: formData.CreatedBy,
        });
      }
    } catch (error: any) {
      toast.error(`Error loading NCR code: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof NCRCodeMasterReq, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsStateChanged(true);
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleCancel = () => {
    if (isStateChanged && !window.confirm("You have unsaved changes. Close without saving?")) {
      return;
    }
    onClose(false);
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!formData.NCRCode.trim()) {
      nextErrors.NCRCode = "NCR Code is required";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix validation errors before submitting");
      return;
    }

    setLoading(true);
    try {
      await NCRCodeService.SaveNCRCode({
        ...formData,
        NCRCode: formData.NCRCode.trim(),
        Description: formData.Description.trim(),
      });
      toast.success(ncrCodeId > 0 ? "NCR Code updated" : "NCR Code created");
      onClose(true);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to save NCR Code";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (ncrCodeId <= 0) return;
    setLoading(true);
    try {
      const response = await NCRCodeService.CheckNCRCodeDeletionImpact(ncrCodeId, formData.TenantId);
      setDeletionImpact(response.result as DeletionImpactResult);
      setShowDeletionDialog(true);
    } catch (error: any) {
      toast.error(`Error checking deletion impact: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const confirmDeletion = async () => {
    if (ncrCodeId <= 0 || !deletionImpact?.canDelete) return;
    setLoading(true);
    try {
      await NCRCodeService.DeleteNCRCode(ncrCodeId, formData.TenantId);
      toast.success("NCR Code deleted");
      setShowDeletionDialog(false);
      onClose(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error.message || "Failed to delete NCR Code");
    } finally {
      setLoading(false);
    }
  };

  if (loading && ncrCodeId > 0 && !formData.NCRCode) {
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
          <h2>{ncrCodeId > 0 ? "Edit NCR Code" : "Add NCR Code"}</h2>
          <button type="button" className="btn-close" onClick={handleCancel}>
            ×
          </button>
        </div>

        <form className="airframe-form" onSubmit={handleSubmit}>
          <div className="tab-content">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="NCRCode">
                  NCR Code <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div className={`input-group ${errors.NCRCode ? "has-error" : ""}`}>
                  <input
                    id="NCRCode"
                    className="form-input"
                    value={formData.NCRCode}
                    maxLength={50}
                    onChange={(e) => handleInputChange("NCRCode", e.target.value)}
                    placeholder="e.g. DIM-001"
                  />
                </div>
                {errors.NCRCode && <span className="error-text">{errors.NCRCode}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="Description">Description</label>
                <textarea
                  id="Description"
                  className="form-input"
                  value={formData.Description}
                  maxLength={500}
                  rows={4}
                  onChange={(e) => handleInputChange("Description", e.target.value)}
                  placeholder="Describe when this code should be used"
                />
              </div>
            </div>
          </div>

          <div className="form-actions">
            {ncrCodeId > 0 && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  marginRight: "auto",
                }}
              >
                Delete
              </button>
            )}
            <button type="button" className="btn-cancel" onClick={handleCancel} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Saving..." : ncrCodeId > 0 ? "Update" : "Save"}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`NCR Code ${formData.NCRCode || `#${ncrCodeId}`}`}
          impact={deletionImpact}
          onConfirm={confirmDeletion}
          onCancel={() => {
            setShowDeletionDialog(false);
            setDeletionImpact(null);
          }}
          isLoading={loading}
        />
      </div>
    </div>
  );
};

export default NCRCodeMasterSlideout;
