import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { faTimes, faSave, faPlus, faCamera, faFileAlt, faUser, faCalendar, faExclamationTriangle, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { QualityService, NonConformanceReport, NCRCategory, NCRSeverity, NCRStatus, RootCauseCategory } from "../../Common/Services/QualityService";
import { JobOrderService, JobOrderMaster } from "../../Common/Services/JobOrderService";
import { EmployeeService } from "../../Common/Services/EmployeeService";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "./NonConformanceReportSlideout.scss";

interface NonConformanceReportSlideoutProps {
  ncrId: number;
  onClose: () => void;
}

const NonConformanceReportSlideout: React.FC<NonConformanceReportSlideoutProps> = ({
  ncrId,
  onClose
}) => {
  console.log("NonConformanceReportSlideout rendered with props:", { ncrId, onClose });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobOrders, setJobOrders] = useState<JobOrderMaster[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  const [ncr, setNcr] = useState<Partial<NonConformanceReport>>({
    title: '',
    description: '',
    category: 'Other',
    severity: 'Minor',
    status: 'Open',
    source: 'Internal',
    reportedBy: 0, // Will be set from userId when saving
    defectLocation: '',
    defectQuantity: 0,
    totalQuantity: 0,
    defectDescription: '',
    photos: [],
    rootCause: '',
    rootCauseCategory: 'Other',
    immediateAction: '',
    correctiveAction: '',
    preventiveAction: '',
    dueDate: '',
    costImpact: 0,
    notes: ''
  });

  useEffect(() => {
    console.log("NonConformanceReportSlideout useEffect triggered, ncrId:", ncrId);
    loadData();
    if (ncrId > 0) {
      console.log("Calling loadNCR for ncrId:", ncrId);
      loadNCR();
    } else {
      console.log("ncrId is not > 0, skipping loadNCR");
    }
  }, [ncrId]);

  // Debug: Log NCR state changes
  useEffect(() => {
    console.log("NCR state changed:", ncr);
    if (ncr.title) {
      console.log("NCR has title, form should be populated");
    } else {
      console.log("NCR title is empty, form will be blank");
    }
  }, [ncr]);

  const loadData = async () => {
    try {
      // Load job orders for dropdown
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const userId = parseInt(storage?.user_UniqueID || "0") || 0;

      const jobOrdersResult = await JobOrderService.GetJobOrders({ tenantid: tenantID });
      setJobOrders(jobOrdersResult || []);

      // Load employees
      const employeesResult = await EmployeeService.GetEmployees({ tenantid: tenantID });
      setEmployees(employeesResult || []);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const loadNCR = async () => {
    console.log("loadNCR function called with ncrId:", ncrId);
    if (ncrId <= 0) {
      console.log("ncrId is invalid (<= 0), skipping load");
      return;
    }

    setLoading(true);
    try {
      console.log("Loading NCR with ID:", ncrId);
      const result = await QualityService.GetNCRById(ncrId);
      console.log("Loaded NCR data:", result);
      if (result) {
        console.log("Setting NCR state with:", result);
        console.log("Current NCR state before setting:", ncr);
        setNcr(result);
        console.log("NCR state set successfully to:", result);
      } else {
        console.log("No NCR data returned from API");
        toast.error("NCR not found or failed to load");
      }
    } catch (error: any) {
      console.error("Error loading NCR:", error);
      console.error("Error details:", error.response?.data || error.message);
      toast.error(`Error loading NCR: ${error.response?.data?.error?.message || error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newPhotos: string[] = [];
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            newPhotos.push(event.target.result as string);
            if (newPhotos.length === files.length) {
              setNcr(prev => ({
                ...prev,
                photos: [...(prev.photos || []), ...newPhotos]
              }));
            }
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleDeletePhoto = (index: number) => {
    setNcr(prev => ({
      ...prev,
      photos: prev.photos?.filter((_, i) => i !== index) || []
    }));
  };

  const handleSave = async () => {
    // Allow partial saves - only require minimal information for tracking
    if (!ncr.title?.trim()) {
      toast.error("Please provide a title for the NCR");
      return;
    }

    setSaving(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const userId = parseInt(storage?.user_UniqueID || "0") || 0; // Use user_UniqueID from login
      const tenantId = storage?.tenantID || 0;

      console.log("Raw localStorage storage:", localStorage.getItem("storage"));
      console.log("Parsed storage object:", storage);
      console.log("Available storage keys:", Object.keys(storage || {}));
      console.log("Extracted tenantId:", tenantId, "userId:", userId);

      if (tenantId <= 0) {
        toast.error("Invalid session. Please log out and log back in.");
        return;
      }

      if (userId <= 0) {
        console.error("Invalid userId detected:", userId, "Storage keys:", Object.keys(storage || {}));
        toast.error(`Invalid user session (userId: ${userId}). Please log out and log back in.`);
        return;
      }

      if (!ncr.title?.trim()) {
        toast.error("Please provide a title for the NCR");
        return;
      }

      const ncrData = {
        ...ncr,
        tenantId,
        reportedBy: ncr.reportedBy || userId,
        reportedDate: ncr.reportedDate || new Date().toISOString(),
        // Clean up optional date fields - convert empty strings to undefined
        dueDate: ncr.dueDate?.trim() || undefined,
        investigatedDate: ncr.investigatedDate?.trim() || undefined,
        approvedDate: ncr.approvedDate?.trim() || undefined,
        closedDate: ncr.closedDate?.trim() || undefined
      };

      console.log("Saving NCR with data:", ncrData);
      console.log("NCR data title:", ncrData.title);
      console.log("NCR data tenantId:", ncrData.tenantId);
      console.log("Original ncr state:", ncr);

      let result;
      if (ncrId > 0) {
        console.log("Updating existing NCR:", ncrId);
        result = await QualityService.UpdateNCR(ncrId, ncrData);
        if (result) {
          toast.success("NCR updated successfully");
        } else {
          toast.error("Failed to update NCR");
        }
      } else {
        console.log("Creating new NCR");
        result = await QualityService.CreateNCR(ncrData as Omit<NonConformanceReport, 'ncrId' | 'ncrNumber'>);
        if (result) {
          toast.success("NCR created successfully");
        } else {
          toast.error("Failed to create NCR");
        }
      }

      if (result) {
        onClose();
      }
    } catch (error: any) {
      console.error("Error saving NCR:", error);
      toast.error(`Error saving NCR: ${error.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (ncrId === 0) return;
    
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const response = await QualityService.CheckNCRDeletionImpact(ncrId, tenantID);
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
    if (ncrId === 0 || !deletionImpact?.canDelete) return;

    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      await QualityService.DeleteNCR(ncrId, tenantID);
      toast.success("NCR deleted successfully");
      setShowDeletionDialog(false);
      onClose();
    } catch (error: any) {
      console.error("Error deleting NCR:", error);
      toast.error(`Error deleting NCR: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof NonConformanceReport, value: any) => {
    setNcr(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleJobOrderChange = (jobOrderId: number) => {
    const selectedJobOrder = jobOrders.find(jo => jo.jobOrderID === jobOrderId);
    if (selectedJobOrder) {
      setNcr(prev => ({
        ...prev,
        jobOrderId: selectedJobOrder.jobOrderID,
        jobOrderNumber: selectedJobOrder.jobOrderNumber?.toString(),
        partNo: selectedJobOrder.partNo,
        partName: selectedJobOrder.partName,
        customerId: selectedJobOrder.customerID,
        customerName: selectedJobOrder.customerName
      }));
    }
  };

  const formatDateForInput = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="ncr-slideout">
        <div className="ncr-slideout-overlay" onClick={onClose} />
        <div className="ncr-slideout-content">
          <div className="loading-state">
            <div>Loading NCR...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ncr-slideout">
      <div className="ncr-slideout-overlay" onClick={onClose} />
      <div className="ncr-slideout-content">
        {/* Header */}
        <div className="ncr-header">
          <div className="ncr-title">
            <FontAwesomeIcon icon={faFileAlt} />
            <h3>{ncrId > 0 ? 'Edit NCR' : 'Create NCR'}</h3>
            {ncr.ncrNumber && <span className="ncr-number">{ncr.ncrNumber}</span>}
          </div>
          <button className="close-button" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Content */}
        <div className="ncr-content">
          <div className="form-info">
            <FontAwesomeIcon icon={faFileAlt} />
            <span>You can save this NCR with minimal information and return later to complete it.</span>
          </div>
          <form className="ncr-form">
            {/* Basic Information */}
            <div className="form-section">
              <h4>Basic Information</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Title <span style={{color: 'red'}}>*</span></label>
                  <input
                    type="text"
                    value={ncr.title || ''}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Brief description of the issue"
                  />
                </div>

                <div className="form-group">
                  <label>Source</label>
                  <select
                    value={ncr.source || 'Internal'}
                    onChange={(e) => handleInputChange('source', e.target.value)}
                  >
                    <option value="Internal">Internal</option>
                    <option value="External">External</option>
                    <option value="Customer">Customer</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={ncr.category || 'Other'}
                    onChange={(e) => handleInputChange('category', e.target.value)}
                  >
                    <option value="Material_Defect">Material Defect</option>
                    <option value="Dimensional_Issue">Dimensional Issue</option>
                    <option value="Process_Failure">Process Failure</option>
                    <option value="Equipment_Problem">Equipment Problem</option>
                    <option value="Documentation_Error">Documentation Error</option>
                    <option value="Supplier_Quality">Supplier Quality</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Severity</label>
                  <select
                    value={ncr.severity || 'Minor'}
                    onChange={(e) => handleInputChange('severity', e.target.value)}
                  >
                    <option value="Minor">Minor</option>
                    <option value="Major">Major</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Description <span style={{color: 'orange'}}>(recommended)</span></label>
                <textarea
                  value={ncr.description || ''}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Detailed description of the non-conformance"
                  rows={3}
                />
              </div>
            </div>

            {/* Job Order Information */}
            <div className="form-section">
              <h4>Job Order Information</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Job Order</label>
                  <select
                    value={ncr.jobOrderId || ''}
                    onChange={(e) => handleJobOrderChange(Number(e.target.value))}
                  >
                    <option value="">Select Job Order</option>
                    {jobOrders.map(jo => (
                      <option key={jo.jobOrderID} value={jo.jobOrderID}>
                        {jo.jobOrderNumber} - {jo.partNo} ({jo.partName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Part Number</label>
                  <input
                    type="text"
                    value={ncr.partNo || ''}
                    onChange={(e) => handleInputChange('partNo', e.target.value)}
                    readOnly={!!ncr.jobOrderId}
                  />
                </div>

                <div className="form-group">
                  <label>Part Name</label>
                  <input
                    type="text"
                    value={ncr.partName || ''}
                    onChange={(e) => handleInputChange('partName', e.target.value)}
                    readOnly={!!ncr.jobOrderId}
                  />
                </div>

                <div className="form-group">
                  <label>Customer</label>
                  <input
                    type="text"
                    value={ncr.customerName || ''}
                    readOnly
                  />
                </div>
              </div>
            </div>

            {/* Defect Details */}
            <div className="form-section">
              <h4>Defect Details</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Defect Location</label>
                  <input
                    type="text"
                    value={ncr.defectLocation || ''}
                    onChange={(e) => handleInputChange('defectLocation', e.target.value)}
                    placeholder="Where was the defect found?"
                  />
                </div>

                <div className="form-group">
                  <label>Defect Quantity</label>
                  <input
                    type="number"
                    value={ncr.defectQuantity || 0}
                    onChange={(e) => handleInputChange('defectQuantity', Number(e.target.value))}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Total Quantity</label>
                  <input
                    type="number"
                    value={ncr.totalQuantity || 0}
                    onChange={(e) => handleInputChange('totalQuantity', Number(e.target.value))}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={formatDateForInput(ncr.dueDate)}
                    onChange={(e) => handleInputChange('dueDate', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Defect Description</label>
                <textarea
                  value={ncr.defectDescription || ''}
                  onChange={(e) => handleInputChange('defectDescription', e.target.value)}
                  placeholder="Detailed description of the defect"
                  rows={2}
                />
              </div>

              {/* Photo Attachments */}
              <div className="form-group">
                <label>Photo Attachments</label>
                <div className="photo-upload-section">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    id="photo-upload"
                  />
                  <label htmlFor="photo-upload" className="photo-upload-btn">
                    <FontAwesomeIcon icon={faCamera} />
                    Choose Photos
                  </label>
                  {ncr.photos && ncr.photos.length > 0 && (
                    <div className="photo-preview-grid">
                      {ncr.photos.map((photo, index) => (
                        <div key={index} className="photo-preview-item">
                          <img src={photo} alt={`Attachment ${index + 1}`} />
                          <button
                            type="button"
                            className="photo-delete-btn"
                            onClick={() => handleDeletePhoto(index)}
                          >
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Root Cause Analysis */}
            <div className="form-section">
              <h4>Root Cause Analysis</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Root Cause Category</label>
                  <select
                    value={ncr.rootCauseCategory || 'Other'}
                    onChange={(e) => handleInputChange('rootCauseCategory', e.target.value)}
                  >
                    <option value="Man">Man (Human Error)</option>
                    <option value="Machine">Machine (Equipment)</option>
                    <option value="Material">Material (Raw Materials)</option>
                    <option value="Method">Method (Process)</option>
                    <option value="Measurement">Measurement (Gauging)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Cost Impact ($)</label>
                  <input
                    type="number"
                    value={ncr.costImpact || 0}
                    onChange={(e) => handleInputChange('costImpact', Number(e.target.value))}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Root Cause</label>
                <textarea
                  value={ncr.rootCause || ''}
                  onChange={(e) => handleInputChange('rootCause', e.target.value)}
                  placeholder="What caused this non-conformance?"
                  rows={2}
                />
              </div>
            </div>

            {/* Corrective Actions */}
            <div className="form-section">
              <h4>Corrective Actions</h4>
              <div className="form-group">
                <label>Immediate Action</label>
                <textarea
                  value={ncr.immediateAction || ''}
                  onChange={(e) => handleInputChange('immediateAction', e.target.value)}
                  placeholder="What immediate action was taken?"
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>Corrective Action</label>
                <textarea
                  value={ncr.correctiveAction || ''}
                  onChange={(e) => handleInputChange('correctiveAction', e.target.value)}
                  placeholder="What corrective action will be taken?"
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>Preventive Action</label>
                <textarea
                  value={ncr.preventiveAction || ''}
                  onChange={(e) => handleInputChange('preventiveAction', e.target.value)}
                  placeholder="What preventive action will prevent recurrence?"
                  rows={2}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="form-section">
              <h4>Additional Notes</h4>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={ncr.notes || ''}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Additional notes or comments"
                  rows={3}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="ncr-footer">
          {ncrId > 0 && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading || saving}
              style={{
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: loading || saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginRight: 'auto'
              }}
            >
              <FontAwesomeIcon icon={faTrash} />
              Delete
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            <FontAwesomeIcon icon={faSave} />
            {saving ? 'Saving...' : (ncrId > 0 ? 'Update NCR' : 'Create NCR')}
          </button>
        </div>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`NCR ${ncr.ncrNumber || ncr.title || `#${ncrId}`}`}
          impact={deletionImpact}
          onConfirm={confirmDeletion}
          onCancel={() => {
            setShowDeletionDialog(false);
            setDeletionImpact(null);
          }}
        />
      </div>
    </div>
  );
};

export default NonConformanceReportSlideout;

// Ensure this file is treated as a module
export {};