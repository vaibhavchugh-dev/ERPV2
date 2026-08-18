import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  WorkstationService,
  WorkstationMasterReq,
  UserWorkstationMapping,
  User,
} from "../../Common/Services/WorkstationService";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "./CustomerMasterSlideout.scss";

interface WorkstationMasterSlideoutProps {
  workstationId: number;
  onClose: (refreshList?: boolean) => void;
}

const WorkstationMasterSlideout: React.FC<WorkstationMasterSlideoutProps> = ({
  workstationId,
  onClose,
}) => {
  const [formData, setFormData] = useState<WorkstationMasterReq>({
    Id: 0,
    WorkstationName: "",
    IsActive: true,
    TenantID: 0,
    UserWorkstationMappings: [],
  });

  const [userMappings, setUserMappings] = useState<UserWorkstationMapping[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({
      ...prev,
      TenantID: storage?.tenantID || 0,
    }));

    loadUsers();

    if (workstationId > 0) {
      loadWorkstation();
    } else {
      // Start with empty user mappings - user can add as needed
      setUserMappings([]);
    }
  }, [workstationId]);

  const loadUsers = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await WorkstationService.GetAllUsers({ tenantid: tenantID });
      if (result && Array.isArray(result)) {
        setUsers(result);
      }
    } catch (error: any) {
      console.error("Error loading users:", error);
      toast.error(`Error loading users: ${error.message || "Unknown error"}`);
    }
  };

  const loadWorkstation = async () => {
    setLoading(true);
    try {
      const workstation = await WorkstationService.GetWorkstationById(workstationId);
      if (workstation) {
        setFormData({
          Id: workstation.Id,
          WorkstationName: workstation.WorkstationName,
          IsActive: workstation.IsActive,
          TenantID: workstation.TenantID,
          UserWorkstationMappings: workstation.UserWorkstationMappings || [],
        });

        // Load user mappings
        if (workstation.UserWorkstationMappings && workstation.UserWorkstationMappings.length > 0) {
          setUserMappings(workstation.UserWorkstationMappings);
        } else {
          // Start with empty user mappings
          setUserMappings([]);
        }
      }
    } catch (error: any) {
      console.error("Error loading workstation:", error);
      toast.error(`Error loading workstation: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof WorkstationMasterReq, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsStateChanged(true);
  };

  const handleUserChange = (index: number, userId: number) => {
    const selectedUser = users.find((u) => u.user_UniqueID === userId);
    const updatedMappings = [...userMappings];
    updatedMappings[index] = {
      ...updatedMappings[index],
      userId: userId,
      userName: selectedUser?.userName || "",
      workstationId: formData.Id || 0,
      tenantId: formData.TenantID,
    };
    setUserMappings(updatedMappings);
    setIsStateChanged(true);
  };

  const handleAddUserMapping = () => {
    const newMapping: UserWorkstationMapping = {
      id: 0,
      workstationId: formData.Id || 0,
      userId: 0,
      tenantId: formData.TenantID,
      userName: "",
    };
    setUserMappings([...userMappings, newMapping]);
    setIsStateChanged(true);
  };

  const handleDeleteUserMapping = (index: number) => {
    const updatedMappings = userMappings.filter((_, i) => i !== index);
    setUserMappings(updatedMappings);
    setIsStateChanged(true);
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.WorkstationName || formData.WorkstationName.trim() === "") {
      newErrors.WorkstationName = "Workstation Name is required";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      toast.error("Please fix validation errors before submitting");
      return false;
    }

    return true;
  };

  const handleDelete = async () => {
    if (workstationId === 0) return;
    
    setLoading(true);
    try {
      const response = await WorkstationService.CheckWorkstationDeletionImpact(workstationId);
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
    if (workstationId === 0 || !deletionImpact?.canDelete) return;

    setLoading(true);
    try {
      await WorkstationService.DeleteWorkstation(workstationId);
      toast.success("Workstation deleted successfully");
      setShowDeletionDialog(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting workstation:", error);
      toast.error(`Error deleting workstation: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeletionImpact = async () => {
    if (workstationId === 0) return;
    
    try {
      const response = await WorkstationService.CheckWorkstationDeletionImpact(workstationId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    // Workstations typically don't have blocking dependencies that can be deleted from the dialog
    toast.info("Dependency deletion not applicable for workstations");
  };

  const handleDeleteAll = async () => {
    // For workstations, if there are no blocking dependencies, just delete directly
    if (deletionImpact?.canDelete) {
      await confirmDeletion();
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      // Filter out mappings with userId = 0 (empty selections)
      const validMappings = userMappings.filter((m) => m.userId > 0);

      const request: WorkstationMasterReq = {
        ...formData,
        UserWorkstationMappings: validMappings,
      };

      await WorkstationService.SaveWorkstation(request);
      toast.success("Workstation saved successfully");
      onClose(true);
    } catch (error: any) {
      console.error("Error saving workstation:", error);
      toast.error(`Error saving workstation: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscard = () => {
    onClose();
  };

  if (loading && workstationId > 0) {
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
    <div className="slideout-overlay" onClick={handleDiscard}>
      <div className="form-card" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>
            {workstationId === 0 ? "New Workstation" : formData.WorkstationName || "Edit Workstation"}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="status-field-inline">
              <div className={`input-group ${formData.IsActive ? 'status-active-group' : 'status-inactive-group'}`} style={{ maxWidth: '150px' }}>
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                  </span>
                </div>
                <select
                  id="IsActive"
                  name="IsActive"
                  className={`form-input ${formData.IsActive ? 'status-active' : 'status-inactive'}`}
                  value={formData.IsActive ? 'Active' : 'Inactive'}
                  onChange={(e) => handleInputChange("IsActive", e.target.value === 'Active')}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <button className="btn-close" onClick={handleDiscard}>
              ×
            </button>
          </div>
        </div>

        <form className="airframe-form" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          {/* Workstation Name */}
          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label htmlFor="WorkstationName">
              Workstation Name <span className="required">*</span>
            </label>
            <div className="input-group">
              <div className="input-group-prepend">
                <span className="input-group-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </span>
              </div>
              <input
                type="text"
                id="WorkstationName"
                name="WorkstationName"
                className={`form-input ${errors.WorkstationName ? "error" : ""}`}
                placeholder="Enter workstation name"
                value={formData.WorkstationName}
                onChange={(e) => handleInputChange("WorkstationName", e.target.value)}
              />
            </div>
            {errors.WorkstationName && (
              <span className="error-message">{errors.WorkstationName}</span>
            )}
          </div>

          {/* Assigned Users Section */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151', margin: 0 }}>Assigned Users</label>
              <button
                type="button"
                className="btn-add-contact"
                onClick={handleAddUserMapping}
              >
                + Add User
              </button>
            </div>

            {userMappings.length === 0 ? (
              <div className="empty-contacts">
                <p>No users assigned</p>
                <button
                  type="button"
                  className="btn-add-contact-inline"
                  onClick={handleAddUserMapping}
                >
                  Add First User
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '0.5rem', backgroundColor: '#ffffff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: '#374151', width: "60px" }}>#</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>User Name</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: '#374151', width: "100px" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userMappings.map((mapping, index) => (
                      <tr key={index} style={{ borderBottom: index < userMappings.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>{index + 1}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <select
                            className="form-input"
                            value={mapping.userId || 0}
                            onChange={(e) =>
                              handleUserChange(index, parseInt(e.target.value))
                            }
                            style={{ width: '100%', maxWidth: '400px' }}
                          >
                            <option value={0}>Select User</option>
                            {users.map((user) => (
                              <option key={user.user_UniqueID} value={user.user_UniqueID}>
                                {user.userName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-icon btn-icon-danger"
                            onClick={() => handleDeleteUserMapping(index)}
                            title="Remove user"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="form-actions">
            {workstationId > 0 && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  opacity: loading ? 0.6 : 1
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Delete
              </button>
            )}
            <button
              type="button"
              className="btn-cancel"
              onClick={handleDiscard}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-submit"
              disabled={loading}
            >
              {loading ? "Saving..." : workstationId > 0 ? "Update Workstation" : "Add Workstation"}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Workstation ${formData.WorkstationName || `#${workstationId}`}`}
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

export default WorkstationMasterSlideout;

