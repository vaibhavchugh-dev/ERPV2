import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  UserManagementService,
  UserDetail,
  UpdateUserRequest,
  Role,
  Permission
} from "../../Common/Services/UserManagementService";
import "./UserManagementSlideout.scss";

interface UserManagementSlideoutProps {
  userId: number;
  onClose: () => void;
  onSave: () => void;
}

const UserManagementSlideout: React.FC<UserManagementSlideoutProps> = ({
  userId,
  onClose,
  onSave
}) => {
  // All hooks must be called unconditionally
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("account");
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Permission[]>([]);
  const [showPermissionViewer, setShowPermissionViewer] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [userData, setUserData] = useState<UserDetail>({
    userUniqueID: 0,
    firstName: "",
    lastName: "",
    email: "",
    userName: "",
    password: "",
    status: "Active",
    role: 1,
    phone1: "",
    phone2: "",
    employeeType: "",
    dateOfHire: "",
    dateOfTermination: "",
    terminationReason: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    street: "",
    primaryContact: "",
    dob: "",
    ssn: "",
    isSalesAgent: 0,
    allowPTO: 0,
    allowPerformance: 0,
    sendWelcomeEmail: 0,
    createDate: new Date()
  });

  useEffect(() => {
    loadRoles();
    if (userId > 0) {
      loadUserData();
    }
  }, [userId]);

  useEffect(() => {
    if (userData.role && userData.role > 0) {
      loadRolePermissions(userData.role);
    } else {
      setRolePermissions([]);
    }
  }, [userData.role]);

  const loadRoles = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;
      const rolesData = await UserManagementService.GetRoles(tenantID);
      setRoles(rolesData);
    } catch (error: any) {
      console.error('Error loading roles:', error);
      toast.error('Failed to load roles');
    }
  };

  const loadRolePermissions = async (roleId: number) => {
    setLoadingPermissions(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;
      console.log('[UserManagementSlideout] Loading permissions for role:', roleId, 'tenant:', tenantID);
      const permissions = await UserManagementService.GetPermissionsByRole(roleId, tenantID);
      console.log('[UserManagementSlideout] Loaded permissions:', permissions);
      setRolePermissions(permissions || []);
    } catch (error: any) {
      console.error('Error loading role permissions:', error);
      toast.error(`Failed to load permissions: ${error.message || 'Unknown error'}`);
      setRolePermissions([]);
    } finally {
      setLoadingPermissions(false);
    }
  };

  const loadUserData = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;

      const user = await UserManagementService.GetUserById(userId, tenantID);
      // Ensure role is a valid number or undefined
      const roleValue = user.role && !isNaN(user.role) && user.role > 0 ? user.role : undefined;
      setUserData({
        ...user,
        role: roleValue
      });
    } catch (error: any) {
      console.error('Error loading user data:', error);
      toast.error('Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof UserDetail, value: any) => {
    // Ensure role is a valid number or undefined
    if (field === 'role') {
      const numValue = value === null || value === '' || isNaN(value) ? undefined : Number(value);
      setUserData(prev => ({
        ...prev,
        [field]: numValue
      }));
    } else {
      setUserData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const validateForm = (): string[] => {
    const errors: string[] = [];

    // Only validate account management fields
    if (!userData.status?.trim()) errors.push("Status is required");
    
    // Validate role - must be a positive number
    const roleValue = userData.role;
    if (!roleValue || roleValue === undefined || isNaN(roleValue) || roleValue <= 0) {
      errors.push("Role is required");
    }

    return errors;
  };

  const handleSave = async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      errors.forEach(error => toast.error(error));
      return;
    }

    setSaving(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;

      // Update account management fields only
      // Profile data (name, email, phone, address) should be managed via Employee Master
      const updateData: UpdateUserRequest = {
        userUniqueID: userData.userUniqueID,
        tenantID,
        status: userData.status,
        role: userData.role,
        isSalesAgent: userData.isSalesAgent === 1,
        allowPTO: userData.allowPTO === 1,
        allowPerformance: userData.allowPerformance === 1,
        terminationReason: userData.terminationReason
      };

      await UserManagementService.UpdateUser(updateData);
      toast.success("User account updated successfully");
      onSave();
    } catch (error: any) {
      console.error('Error saving user:', error);
      toast.error(`Error saving user: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const renderAccountTab = () => (
    <div className="form-section">
      <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f0f9ff', borderRadius: '0.375rem', fontSize: '0.875rem', color: '#0369a1' }}>
        <strong>Note:</strong> Profile information (name, email, phone, address) should be managed via <strong>Employee Master</strong>.
      </div>

      <h3>User Information (Read-Only)</h3>
      <div className="form-row">
        <div className="form-group">
          <label>Full Name</label>
          <input
            type="text"
            value={`${userData.firstName || ''} ${userData.lastName || ''}`.trim() || '-'}
            className="form-input"
            readOnly
            style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
          />
        </div>
        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            value={userData.userName || '-'}
            className="form-input"
            readOnly
            style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={userData.email || '-'}
            className="form-input"
            readOnly
            style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
          />
        </div>
        <div className="form-group">
          <label>Employee Type</label>
          <input
            type="text"
            value={userData.employeeType || '-'}
            className="form-input"
            readOnly
            style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
          />
        </div>
      </div>

      <h3>Account Management</h3>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="role">Role *</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              id="role"
              value={userData.role && userData.role > 0 ? userData.role : ""}
              onChange={(e) => {
                const roleValue = e.target.value ? parseInt(e.target.value, 10) : undefined;
                if (roleValue && !isNaN(roleValue) && roleValue > 0) {
                  handleInputChange("role", roleValue);
                } else {
                  handleInputChange("role", undefined);
                }
              }}
              className="form-select"
              required
              style={{ flex: 1 }}
            >
              <option value="">Select Role</option>
              {roles.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-sm btn-info"
              onClick={() => setShowPermissionViewer(true)}
              title="View permissions for this role"
              disabled={!userData.role || userData.role === 0}
            >
              <i className="fas fa-eye" style={{ marginRight: '0.25rem' }}></i> View Permissions
            </button>
          </div>
          {loadingPermissions && (
            <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
              Loading permissions...
            </small>
          )}
          {!loadingPermissions && rolePermissions.length > 0 && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#f3f4f6', borderRadius: '0.25rem' }}>
              <small style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 500 }}>
                {rolePermissions.length} permission{rolePermissions.length !== 1 ? 's' : ''} assigned - Click "View Permissions" to see details
              </small>
            </div>
          )}
          {!loadingPermissions && userData.role && userData.role > 0 && rolePermissions.length === 0 && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#fef3c7', borderRadius: '0.25rem' }}>
              <small style={{ color: '#92400e', fontSize: '0.75rem' }}>
                No permissions assigned to this role.
              </small>
            </div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="status">Status *</label>
          <select
            id="status"
            value={userData.status || "Active"}
            onChange={(e) => handleInputChange("status", e.target.value)}
            className="form-select"
            required
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
      </div>

      {userData.status === "Inactive" && (
        <div className="form-row">
          <div className="form-group full-width">
            <label htmlFor="terminationReason">Termination Reason</label>
            <input
              id="terminationReason"
              type="text"
              value={userData.terminationReason || ""}
              onChange={(e) => handleInputChange("terminationReason", e.target.value)}
              className="form-input"
              placeholder="Reason for deactivation"
            />
          </div>
        </div>
      )}

      <h3>Permissions</h3>
      <div className="form-row">
        <div className="form-group full-width">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={userData.isSalesAgent === 1}
              onChange={(e) => handleInputChange("isSalesAgent", e.target.checked ? 1 : 0)}
            />
            Sales Agent
          </label>
        </div>
      </div>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="form-section">
      <h3>Security & Permissions</h3>

      <div className="form-row">
        <div className="form-group full-width">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={userData.allowPTO === 1}
              onChange={(e) => handleInputChange("allowPTO", e.target.checked ? 1 : 0)}
            />
            Allow PTO Tracking
          </label>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group full-width">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={userData.allowPerformance === 1}
              onChange={(e) => handleInputChange("allowPerformance", e.target.checked ? 1 : 0)}
            />
            Allow Performance Tracking
          </label>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', padding: '0.75rem', backgroundColor: '#fef3c7', borderRadius: '0.375rem', fontSize: '0.875rem', color: '#92400e' }}>
        <strong>Note:</strong> Password reset can be performed from the main User Management page using the "Reset Password" button.
      </div>
    </div>
  );

  // Address tab removed - address information should be managed via Employee Master

  // User Management only works in edit mode - users are created via Employee Master
  if (userId === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="slideout-overlay">
        <div className="slideout-panel">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading user data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="slideout-overlay">
      <div className="slideout-panel">
        <div className="slideout-header">
          <h2>Manage User Account</h2>
          <button className="slideout-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="slideout-tabs">
          <button
            className={`tab-button ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            Account
          </button>
          <button
            className={`tab-button ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            Security & Permissions
          </button>
        </div>

        <div className="slideout-content">
          {activeTab === 'account' && renderAccountTab()}
          {activeTab === 'security' && renderSecurityTab()}
        </div>

        <div className="slideout-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : (
              <>
                <i className="fas fa-save"></i> Update Account
              </>
            )}
          </button>
        </div>
      </div>

      {showPermissionViewer && (
        <div className="slideout-overlay" style={{ zIndex: 10001 }}>
          <div className="slideout-panel" style={{ maxWidth: '600px', maxHeight: '80vh' }}>
            <div className="slideout-header">
              <h3>
                Permissions for: {roles.find(r => r.id === userData.role)?.name || 'Unknown Role'}
              </h3>
              <button className="slideout-close" onClick={() => setShowPermissionViewer(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="slideout-content" style={{ overflowY: 'auto' }}>
              {loadingPermissions ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                  Loading permissions...
                </p>
              ) : rolePermissions.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                    No permissions assigned to this role.
                  </p>
                  <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '1rem' }}>
                    To assign permissions, go back to the User Management table and click the <i className="fas fa-cog" style={{ fontSize: '0.7rem' }}></i> icon next to the role.
                  </p>
                </div>
              ) : (
                <div className="permissions-list">
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f0f9ff', borderRadius: '0.375rem' }}>
                    <strong style={{ color: '#0369a1' }}>{rolePermissions.length} permission{rolePermissions.length !== 1 ? 's' : ''} assigned</strong>
                  </div>
                  {rolePermissions.map(permission => (
                    <div
                      key={permission.permissionId}
                      style={{
                        padding: '0.75rem',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, color: '#111827' }}>
                          {permission.displayName || permission.permissionName || `Permission ${permission.permissionId}`}
                        </div>
                        {permission.levelInfo > 0 && (
                          <small style={{ color: '#6b7280' }}>Level {permission.levelInfo}</small>
                        )}
                        {permission.permissionName && (
                          <small style={{ color: '#9ca3af', display: 'block', fontSize: '0.75rem' }}>
                            ID: {permission.permissionId}
                          </small>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 500 }}>
                        ✓ Assigned
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="slideout-footer">
              <button className="btn btn-secondary" onClick={() => setShowPermissionViewer(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementSlideout;
