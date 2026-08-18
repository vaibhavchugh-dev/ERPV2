import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  UserManagementService,
  Role,
  CreateRoleRequest,
  UpdateRoleRequest
} from "../../Common/Services/UserManagementService";
import "./RoleManager.scss";

interface RoleManagerProps {
  onClose: () => void;
  onSave: () => void;
  onManagePermissions?: (roleId: number) => void;
}

const RoleManager: React.FC<RoleManagerProps> = ({ onClose, onSave, onManagePermissions }) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formData, setFormData] = useState({
    roleName: "",
    description: "",
    orderNo: 0,
    resetPwd: "N"
  });

  useEffect(() => {
    loadRoles();
  }, []);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showForm) {
          setShowForm(false);
          setEditingRole(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showForm, onClose]);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;
      const rolesData = await UserManagementService.GetRoles(tenantID);
      setRoles(rolesData);
    } catch (error: any) {
      console.error('Error loading roles:', error);
      toast.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCreate = () => {
    setEditingRole(null);
    setFormData({
      roleName: "",
      description: "",
      orderNo: roles.length + 1,
      resetPwd: "N"
    });
    setShowForm(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      roleName: role.name || "",
      description: role.description || "",
      orderNo: (role as any).orderNo || 0,
      resetPwd: "N"
    });
    setShowForm(true);
  };

  const handleDelete = async (roleId: number) => {
    if (!window.confirm("Are you sure you want to delete this role? This action cannot be undone.")) {
      return;
    }

    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;
      await UserManagementService.DeleteRole(roleId, tenantID);
      toast.success("Role deleted successfully");
      loadRoles();
      onSave();
    } catch (error: any) {
      console.error('Error deleting role:', error);
      const errorMessage = error.response?.data?.message || `Error deleting role: ${error.message || 'Unknown error'}`;
      toast.error(errorMessage);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.roleName.trim()) {
      toast.error("Role name is required");
      return;
    }

    setSaving(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;

      if (editingRole) {
        const updateRequest: UpdateRoleRequest = {
          roleId: editingRole.id,
          tenantId: tenantID,
          roleName: formData.roleName,
          description: formData.description,
          orderNo: formData.orderNo,
          resetPwd: formData.resetPwd
        };
        await UserManagementService.UpdateRole(updateRequest);
        toast.success("Role updated successfully");
      } else {
        const createRequest: CreateRoleRequest = {
          roleName: formData.roleName,
          description: formData.description,
          tenantId: tenantID,
          orderNo: formData.orderNo || undefined,
          resetPwd: formData.resetPwd
        };
        const result = await UserManagementService.CreateRole(createRequest);
        toast.success("Role created successfully");
        setShowForm(false);
        setEditingRole(null);
        await loadRoles();
        onSave();
        if (onManagePermissions && result?.role?.id) {
          onManagePermissions(result.role.id);
        }
        return;
      }

      setShowForm(false);
      setEditingRole(null);
      loadRoles();
      onSave();
    } catch (error: any) {
      console.error('Error saving role:', error);
      const errorMessage = error.response?.data?.message || `Error saving role: ${error.message || 'Unknown error'}`;
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="role-manager-overlay">
        <div className="role-manager-panel">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading roles...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="role-manager-overlay">
      <div className="role-manager-panel">
        <div className="role-manager-header">
          <h2>Manage Roles</h2>
          <button className="close-button" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="role-manager-content">
          {!showForm ? (
            <>
              <div className="role-manager-actions">
                <button className="btn btn-primary" onClick={handleCreate}>
                  <i className="fas fa-plus"></i> Create New Role
                </button>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
                  Permissions belong to the role. Configure them here before assigning the role to employees.
                </p>
              </div>

              <div className="roles-list">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Role Name</th>
                      <th>Description</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="no-data">
                          No roles found. Create your first role!
                        </td>
                      </tr>
                    ) : (
                      roles.map((role) => (
                        <tr key={role.id}>
                          <td>{(role as any).orderNo || '-'}</td>
                          <td>{role.name}</td>
                          <td>{role.description || '-'}</td>
                          <td>
                            <div className="action-buttons">
                              {onManagePermissions && (
                                <button
                                  className="btn btn-sm btn-info"
                                  onClick={() => onManagePermissions(role.id)}
                                  title="Manage Permissions"
                                >
                                  <i className="fas fa-key"></i>
                                </button>
                              )}
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleEdit(role)}
                                title="Edit Role"
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => handleDelete(role.id)}
                                title="Delete Role"
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="role-form">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>{editingRole ? 'Edit Role' : 'Create New Role'}</h3>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowForm(false);
                    setEditingRole(null);
                  }}
                  style={{ marginLeft: 'auto' }}
                >
                  <i className="fas fa-arrow-left"></i> Back to List
                </button>
              </div>
              
              <div className="form-group">
                <label htmlFor="roleName">Role Name *</label>
                <input
                  id="roleName"
                  type="text"
                  value={formData.roleName}
                  onChange={(e) => handleInputChange("roleName", e.target.value)}
                  className="form-input"
                  required
                  placeholder="e.g., Supervisor, Analyst"
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  className="form-input"
                  rows={3}
                  placeholder="Brief description of the role"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="orderNo">Order Number</label>
                  <input
                    id="orderNo"
                    type="number"
                    value={formData.orderNo}
                    onChange={(e) => handleInputChange("orderNo", parseInt(e.target.value) || 0)}
                    className="form-input"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="resetPwd">Reset Password Required</label>
                  <select
                    id="resetPwd"
                    value={formData.resetPwd}
                    onChange={(e) => handleInputChange("resetPwd", e.target.value)}
                    className="form-select"
                  >
                    <option value="N">No</option>
                    <option value="Y">Yes</option>
                  </select>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowForm(false);
                    setEditingRole(null);
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? "Saving..." : (
                    <>
                      <i className="fas fa-save"></i> {editingRole ? 'Update' : 'Create'} Role
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoleManager;

