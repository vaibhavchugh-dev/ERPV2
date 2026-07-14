import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import {
  UserManagementService,
  Role,
  PermissionDetail,
  AssignPermissionsRequest
} from "../../Common/Services/UserManagementService";
import "./RolePermissionManager.scss";

interface RolePermissionManagerProps {
  roleId: number;
  tenantId: number;
  onClose: () => void;
  onSave: () => void;
}

const RolePermissionManager: React.FC<RolePermissionManagerProps> = ({
  roleId,
  tenantId,
  onClose,
  onSave
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allPermissions, setAllPermissions] = useState<PermissionDetail[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<number>>(new Set());
  const [roleName, setRoleName] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load all permissions
      console.log('[RolePermissionManager] Loading all permissions for tenant:', tenantId);
      const permissions = await UserManagementService.GetAllPermissions(tenantId);
      console.log('[RolePermissionManager] Loaded permissions:', permissions);
      console.log('[RolePermissionManager] Permissions type:', typeof permissions);
      console.log('[RolePermissionManager] Is array?', Array.isArray(permissions));
      console.log('[RolePermissionManager] Permissions count:', permissions?.length || 0);
      
      const permissionsArray = Array.isArray(permissions) ? permissions : [];
      setAllPermissions(permissionsArray);
      console.log('[RolePermissionManager] Set allPermissions to:', permissionsArray.length, 'items');

      if (!permissionsArray || permissionsArray.length === 0) {
        console.log('[RolePermissionManager] No permissions found - seed button should be visible');
      }

      // Load current role permissions
      const rolePermissions = await UserManagementService.GetPermissionsByRole(roleId, tenantId);
      setSelectedPermissions(new Set(rolePermissions.map(p => p.permissionId)));

      // Get role name
      const roles = await UserManagementService.GetRoles(tenantId);
      const role = roles.find(r => r.id === roleId);
      setRoleName(role?.name || "Unknown Role");
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast.error(`Failed to load permissions: ${error.message || 'Unknown error'}`);
      setAllPermissions([]); // Ensure it's set to empty array on error
    } finally {
      setLoading(false);
    }
  }, [roleId, tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePermissionToggle = (permissionId: number) => {
    setSelectedPermissions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedPermissions.size === allPermissions.length) {
      setSelectedPermissions(new Set());
    } else {
      setSelectedPermissions(new Set(allPermissions.map(p => p.permissionId)));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const request: AssignPermissionsRequest = {
        roleId,
        tenantId,
        permissionIds: Array.from(selectedPermissions)
      };

      await UserManagementService.AssignPermissionsToRole(request);
      toast.success("Permissions updated successfully");
      onSave();
    } catch (error: any) {
      console.error('Error saving permissions:', error);
      toast.error(`Error saving permissions: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Group permissions by module
  const groupedPermissions = allPermissions.reduce((acc, perm) => {
    const module = perm.moduleName || "General";
    if (!acc[module]) {
      acc[module] = [];
    }
    acc[module].push(perm);
    return acc;
  }, {} as Record<string, PermissionDetail[]>);

  console.log('[RolePermissionManager] Rendering - loading:', loading, 'permissions:', allPermissions?.length || 0);

  if (loading) {
    return (
      <div className="role-permission-manager-overlay">
        <div className="role-permission-manager-panel">
          <div className="loading-spinner">
            <i className="fas fa-spinner fa-spin"></i> Loading permissions...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="role-permission-manager-overlay">
      <div className="role-permission-manager-panel">
        <div className="role-permission-manager-header">
          <h2>Manage Permissions: {roleName}</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            {allPermissions && allPermissions.length > 0 ? (
              <button
                className="btn btn-sm btn-warning"
                onClick={async () => {
                  if (!window.confirm(`This will clear all ${allPermissions.length} existing permissions and role assignments, then reseed with updated permissions. Continue?`)) {
                    return;
                  }
                  try {
                    console.log('[Clear and Reseed] Clicked - Current permissions:', allPermissions?.length || 0);
                    toast.info('Clearing existing permissions and reseeding...');
                    const result = await UserManagementService.SeedPermissions(true);
                    toast.success(result.message || 'Permissions cleared and reseeded successfully');
                    await loadData(); // Reload after seeding
                  } catch (error: any) {
                    console.error('Error clearing and reseeding permissions:', error);
                    toast.error(`Failed to clear and reseed permissions: ${error.message || 'Unknown error'}`);
                  }
                }}
                style={{ 
                  fontSize: '0.875rem', 
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: '2px solid #d97706',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  minWidth: '160px',
                  display: 'inline-block',
                  visibility: 'visible',
                  opacity: 1,
                  zIndex: 1000,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
                title={`Clear ${allPermissions?.length || 0} existing permissions and reseed`}
              >
                🔄 Clear & Reseed
              </button>
            ) : (
              <button
                className="btn btn-sm btn-primary"
                onClick={async () => {
                  try {
                    console.log('[Seed Button] Clicked - Current permissions:', allPermissions?.length || 0);
                    toast.info('Seeding permissions...');
                    const result = await UserManagementService.SeedPermissions();
                    toast.success(result.message || 'Permissions seeded successfully');
                    await loadData(); // Reload after seeding
                  } catch (error: any) {
                    console.error('Error seeding permissions:', error);
                    toast.error(`Failed to seed permissions: ${error.message || 'Unknown error'}`);
                  }
                }}
                style={{ 
                  fontSize: '0.875rem', 
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: '2px solid #4f46e5',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  minWidth: '150px',
                  display: 'inline-block',
                  visibility: 'visible',
                  opacity: 1,
                  zIndex: 1000,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
                title={`Seed permissions (Current: ${allPermissions?.length || 0})`}
              >
                🌱 Seed Permissions
              </button>
            )}
            <button className="close-button" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div className="role-permission-manager-content">
          {(!allPermissions || allPermissions.length === 0) ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ color: '#6b7280', marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                  No Permissions Available
                </p>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  The PermissionMaster table is empty. Click the button below to seed initial permissions.
                </p>
              </div>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    toast.info('Seeding permissions...');
                    const result = await UserManagementService.SeedPermissions();
                    toast.success(result.message || 'Permissions seeded successfully');
                    await loadData(); // Reload after seeding
                  } catch (error: any) {
                    console.error('Error seeding permissions:', error);
                    toast.error(`Failed to seed permissions: ${error.message || 'Unknown error'}`);
                  }
                }}
                style={{ 
                  padding: '0.75rem 1.5rem', 
                  fontSize: '1rem',
                  fontWeight: 500,
                  marginBottom: '1rem',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              >
                🌱 Seed Initial Permissions
              </button>
              {allPermissions && allPermissions.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fef3c7', borderRadius: '0.375rem', border: '1px solid #fbbf24' }}>
                  <p style={{ color: '#92400e', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                    ⚠️ Permissions already exist ({allPermissions.length} records)
                  </p>
                  <p style={{ color: '#92400e', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                    To update permissions to match the current menu structure, use the "🔄 Clear & Reseed" button in the header.
                  </p>
                  <button
                    className="btn btn-warning"
                    onClick={async () => {
                      if (!window.confirm(`This will clear all ${allPermissions.length} existing permissions and role assignments, then reseed with updated permissions. Continue?`)) {
                        return;
                      }
                      try {
                        toast.info('Clearing existing permissions and reseeding...');
                        const result = await UserManagementService.SeedPermissions(true);
                        toast.success(result.message || 'Permissions cleared and reseeded successfully');
                        await loadData(); // Reload after seeding
                      } catch (error: any) {
                        console.error('Error clearing and reseeding permissions:', error);
                        toast.error(`Failed to clear and reseed permissions: ${error.message || 'Unknown error'}`);
                      }
                    }}
                    style={{ 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Clear & Reseed Permissions
                  </button>
                </div>
              )}
              <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '1rem', maxWidth: '500px', margin: '1rem auto 0' }}>
                This will create 26 common permissions including: User Management, Vendors, Accounting, Reports, Labor Management, and more.
              </p>
            </div>
          ) : (
            <>
              <div className="permission-actions">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={handleSelectAll}
                >
                  {selectedPermissions.size === allPermissions.length ? "Deselect All" : "Select All"}
                </button>
                <span className="permission-count">
                  {selectedPermissions.size} of {allPermissions.length} permissions selected
                </span>
              </div>

              <div className="permissions-list">
                {Object.entries(groupedPermissions).map(([module, permissions]) => (
                  <div key={module} className="permission-module">
                    <h3>{module}</h3>
                    <div className="permission-items">
                      {permissions.map(permission => (
                        <label key={permission.permissionId} className="permission-item">
                          <input
                            type="checkbox"
                            checked={selectedPermissions.has(permission.permissionId)}
                            onChange={() => handlePermissionToggle(permission.permissionId)}
                          />
                          <span className="permission-name">
                            {permission.displayName || permission.permissionName || `Permission ${permission.permissionId}`}
                          </span>
                          {permission.levelInfo > 0 && (
                            <span className="permission-level">Level {permission.levelInfo}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="role-permission-manager-footer">
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
            {saving ? (
              <>
                <i className="fas fa-spinner fa-spin"></i> Saving...
              </>
            ) : (
              <>
                <i className="fas fa-save"></i> Save Permissions
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RolePermissionManager;

