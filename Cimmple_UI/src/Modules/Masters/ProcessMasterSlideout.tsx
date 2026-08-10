import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  ProcessService,
  ProcessMasterReq,
  PROCESS_CATEGORIES,
} from "../../Common/Services/ProcessService";
import {
  WorkstationService,
  WorkstationMaster,
} from "../../Common/Services/WorkstationService";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "./CustomerMasterSlideout.scss";

interface ProcessMasterSlideoutProps {
  processId: number;
  onClose: (refreshList?: boolean) => void;
}

const emptyForm = (): ProcessMasterReq => ({
  Id: 0,
  ProcessCode: "",
  ProcessName: "",
  Srno: 0,
  PDescription: "",
  IsFixed: 0,
  IsSystem: false,
  Status: "Active",
  Ledgercode: "",
  ProcessCategory: "",
  DefaultEstimatedTimeMinutes: null,
  DefaultWorkstationId: null,
  StandardCostPerHour: null,
  Tenantid: 0,
});

const ProcessMasterSlideout: React.FC<ProcessMasterSlideoutProps> = ({
  processId,
  onClose,
}) => {
  const [formData, setFormData] = useState<ProcessMasterReq>(emptyForm());
  const [workstations, setWorkstations] = useState<WorkstationMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({
      ...prev,
      Tenantid: storage?.tenantID || 0,
    }));

    loadWorkstations();

    if (processId > 0) {
      loadProcess();
    } else {
      loadNextSequenceNumber();
    }
  }, [processId]);

  const loadWorkstations = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === "development") {
        tenantID = 1;
      }
      const result = await WorkstationService.GetWorkstations({ tenantid: tenantID });
      if (result && Array.isArray(result)) {
        setWorkstations(result.filter((w) => w.isActive !== false));
      }
    } catch (error) {
      console.error("Error loading workstations:", error);
    }
  };

  const loadNextSequenceNumber = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const processes = await ProcessService.GetProcesses({ tenantid: tenantID });
      if (processes && processes.length > 0) {
        const maxSrno = Math.max(...processes.map((p) => p.srno || 0));
        setFormData((prev) => ({ ...prev, Srno: maxSrno + 1 }));
      } else {
        setFormData((prev) => ({ ...prev, Srno: 1 }));
      }
    } catch {
      setFormData((prev) => ({ ...prev, Srno: 1 }));
    }
  };

  const loadProcess = async () => {
    setLoading(true);
    try {
      const process = await ProcessService.GetProcessById(processId);
      if (process) {
        setFormData({
          ...emptyForm(),
          ...process,
        });
      }
    } catch (error: any) {
      console.error("Error loading process:", error);
      toast.error(`Error loading process: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof ProcessMasterReq, value: any) => {
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

    if (!formData.ProcessName || formData.ProcessName.trim() === "") {
      newErrors.ProcessName = "Process name is required";
    }

    if (
      formData.DefaultEstimatedTimeMinutes != null &&
      formData.DefaultEstimatedTimeMinutes < 0
    ) {
      newErrors.DefaultEstimatedTimeMinutes = "Estimated time cannot be negative";
    }

    if (
      formData.StandardCostPerHour != null &&
      formData.StandardCostPerHour < 0
    ) {
      newErrors.StandardCostPerHour = "Cost cannot be negative";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDelete = async () => {
    if (processId === 0) return;

    setLoading(true);
    try {
      const response = await ProcessService.CheckProcessDeletionImpact(processId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
      setShowDeletionDialog(true);
    } catch (error: any) {
      console.error("Error checking deletion impact:", error);
      toast.error(`Error checking deletion impact: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const confirmDeletion = async () => {
    if (processId === 0 || !deletionImpact?.canDelete) return;

    setLoading(true);
    try {
      await ProcessService.DeleteProcess(processId);
      toast.success("Process deleted successfully");
      setShowDeletionDialog(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting process:", error);
      toast.error(`Error deleting process: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeletionImpact = async () => {
    if (processId === 0) return;

    try {
      const response = await ProcessService.CheckProcessDeletionImpact(processId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteDependency = async () => {
    toast.info("Dependency deletion not applicable for processes");
  };

  const handleDeleteAll = async () => {
    if (deletionImpact?.canDelete) {
      await confirmDeletion();
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    setLoading(true);
    try {
      await ProcessService.SaveProcess({
        ...formData,
        DefaultWorkstationId: formData.DefaultWorkstationId || null,
        DefaultEstimatedTimeMinutes:
          formData.DefaultEstimatedTimeMinutes === null ||
          formData.DefaultEstimatedTimeMinutes === ("" as any)
            ? null
            : formData.DefaultEstimatedTimeMinutes,
        StandardCostPerHour:
          formData.StandardCostPerHour === null ||
          formData.StandardCostPerHour === ("" as any)
            ? null
            : formData.StandardCostPerHour,
      });
      toast.success(
        processId > 0
          ? "Process updated successfully"
          : "Process created successfully"
      );
      setIsStateChanged(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error saving process:", error);
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Unknown error";
      toast.error(`Error saving process: ${message}`);
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

  if (loading && processId > 0) {
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
          <h2>{processId > 0 ? "Edit Process" : "Add New Process"}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className="status-field-inline">
              <div className={`input-group ${formData.Status === "Active" ? "status-active-group" : "status-inactive-group"}`} style={{ maxWidth: "150px" }}>
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
                  className={`form-input ${formData.Status === "Active" ? "status-active" : "status-inactive"}`}
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
                <label htmlFor="ProcessCode">Process Code</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="ProcessCode"
                    className="form-input"
                    placeholder="e.g. MILL-01"
                    value={formData.ProcessCode}
                    onChange={(e) => handleInputChange("ProcessCode", e.target.value)}
                    maxLength={50}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="ProcessName">
                  Process Name <span className="required">*</span>
                </label>
                <div className={`input-group ${errors.ProcessName ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="ProcessName"
                    className={`form-input ${errors.ProcessName ? "error" : ""}`}
                    placeholder="Enter process name"
                    value={formData.ProcessName}
                    onChange={(e) => handleInputChange("ProcessName", e.target.value)}
                    required
                    maxLength={200}
                  />
                </div>
                {errors.ProcessName && (
                  <span className="error-message">{errors.ProcessName}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ProcessCategory">Category</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <select
                    id="ProcessCategory"
                    className="form-input"
                    value={formData.ProcessCategory}
                    onChange={(e) => handleInputChange("ProcessCategory", e.target.value)}
                  >
                    <option value="">Select category...</option>
                    {PROCESS_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    {formData.ProcessCategory &&
                      !(PROCESS_CATEGORIES as readonly string[]).includes(formData.ProcessCategory) && (
                        <option value={formData.ProcessCategory}>{formData.ProcessCategory}</option>
                      )}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="Ledgercode">Ledger Code</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="Ledgercode"
                    className="form-input"
                    placeholder="Enter ledger code"
                    value={formData.Ledgercode}
                    onChange={(e) => handleInputChange("Ledgercode", e.target.value)}
                    maxLength={50}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="PDescription">Description</label>
              <div className="input-group">
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                  </span>
                </div>
                <input
                  type="text"
                  id="PDescription"
                  className="form-input"
                  placeholder="Enter process description"
                  value={formData.PDescription}
                  onChange={(e) => handleInputChange("PDescription", e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="DefaultEstimatedTimeMinutes">Default Est. Time (min)</label>
                <div className={`input-group ${errors.DefaultEstimatedTimeMinutes ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="number"
                    id="DefaultEstimatedTimeMinutes"
                    className={`form-input no-spinner ${errors.DefaultEstimatedTimeMinutes ? "error" : ""}`}
                    placeholder="e.g. 45"
                    min={0}
                    value={formData.DefaultEstimatedTimeMinutes ?? ""}
                    onChange={(e) =>
                      handleInputChange(
                        "DefaultEstimatedTimeMinutes",
                        e.target.value === "" ? null : parseInt(e.target.value, 10)
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
                {errors.DefaultEstimatedTimeMinutes && (
                  <span className="error-message">{errors.DefaultEstimatedTimeMinutes}</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="DefaultWorkstationId">Default Workstation</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <select
                    id="DefaultWorkstationId"
                    className="form-input"
                    value={formData.DefaultWorkstationId ?? ""}
                    onChange={(e) =>
                      handleInputChange(
                        "DefaultWorkstationId",
                        e.target.value === "" ? null : parseInt(e.target.value, 10)
                      )
                    }
                  >
                    <option value="">None</option>
                    {workstations.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.workstationName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="StandardCostPerHour">Standard Cost / Hour</label>
                <div className={`input-group ${errors.StandardCostPerHour ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="number"
                    id="StandardCostPerHour"
                    className={`form-input no-spinner ${errors.StandardCostPerHour ? "error" : ""}`}
                    placeholder="e.g. 85.00"
                    min={0}
                    step="0.01"
                    value={formData.StandardCostPerHour ?? ""}
                    onChange={(e) =>
                      handleInputChange(
                        "StandardCostPerHour",
                        e.target.value === "" ? null : parseFloat(e.target.value)
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
                {errors.StandardCostPerHour && (
                  <span className="error-message">{errors.StandardCostPerHour}</span>
                )}
              </div>
              <div className="form-group">
                <label
                  htmlFor="IsFixed"
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", marginTop: "1.75rem" }}
                >
                  <input
                    type="checkbox"
                    id="IsFixed"
                    checked={formData.IsFixed === 1}
                    onChange={(e) => handleInputChange("IsFixed", e.target.checked ? 1 : 0)}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <span>Outside Services</span>
                </label>
                <small style={{ color: "#6b7280", display: "block", marginTop: "0.25rem" }}>
                  Performed by an outside vendor rather than in-house
                </small>
              </div>
            </div>
          </div>

          <div className="form-actions" style={{ flexShrink: 0 }}>
            {processId > 0 && !formData.IsSystem && (
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
                  fontWeight: "500",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Delete
              </button>
            )}
            <button type="button" className="btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Saving..." : processId > 0 ? "Update" : "Save"}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Process ${formData.ProcessName || `#${processId}`}`}
          impact={deletionImpact}
          onConfirm={confirmDeletion}
          onCancel={() => {
            setShowDeletionDialog(false);
            setDeletionImpact(null);
          }}
          onDeleteDependency={handleDeleteDependency}
          onRefreshImpact={refreshDeletionImpact}
          onDeleteAll={handleDeleteAll}
          isLoading={loading}
        />
      </div>
    </div>
  );
};

export default ProcessMasterSlideout;
