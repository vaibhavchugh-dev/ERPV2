import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "react-toastify";
import {
  UserManagementService,
  PermissionDetail,
  AssignPermissionsRequest
} from "../../Common/Services/UserManagementService";
import { AuthService } from "../../Common/Services/AuthService";
import { confirmDiscardChanges, onBackdropClick } from "../../Common/Utils/dismissGuard";
import "./RolePermissionManager.scss";

interface RolePermissionManagerProps {
  roleId: number;
  tenantId: number;
  onClose: () => void;
  onSave: () => void;
}

const USER_MGMT_URL = "/user-management";

const pageUrlOf = (p: PermissionDetail): string => {
  const raw = (p.url || "").split("#")[0].replace(/\/$/, "") || "";
  return raw.toLowerCase();
};

const isActionPerm = (p: PermissionDetail) =>
  p.levelInfo === 2 || !!(p.url && p.url.includes("#"));

const isAdminOnlyPerm = (p: PermissionDetail) =>
  pageUrlOf(p) === USER_MGMT_URL || AuthService.isAdminOnlyPath(p.url || "");

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
  const [targetIsAdmin, setTargetIsAdmin] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const handleDismiss = () => {
    if (saving) return;
    if (confirmDiscardChanges(isDirty)) onClose();
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const permissions = await UserManagementService.GetAllPermissions(tenantId);
      const permissionsArray = Array.isArray(permissions) ? permissions : [];
      setAllPermissions(permissionsArray);

      const rolePermissions = await UserManagementService.GetPermissionsByRole(roleId, tenantId);
      setSelectedPermissions(new Set(rolePermissions.map((p) => p.permissionId)));

      const roles = await UserManagementService.GetRoles(tenantId);
      const role = roles.find((r) => r.id === roleId);
      setRoleName(role?.name || "Unknown Role");
      setTargetIsAdmin(/admin/i.test(role?.name || "") || /admin/i.test(role?.description || ""));
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error(`Failed to load permissions: ${error.message || "Unknown error"}`);
      setAllPermissions([]);
    } finally {
      setLoading(false);
    }
  }, [roleId, tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** Permissions shown in the UI (hide User Management for non-admin target roles). */
  const visiblePermissions = useMemo(() => {
    if (targetIsAdmin) return allPermissions;
    return allPermissions.filter((p) => !isAdminOnlyPerm(p));
  }, [allPermissions, targetIsAdmin]);

  const pagePermissions = useMemo(
    () => visiblePermissions.filter((p) => !isActionPerm(p)),
    [visiblePermissions]
  );

  const actionsByPage = useMemo(() => {
    const map = new Map<string, PermissionDetail[]>();
    for (const p of visiblePermissions.filter(isActionPerm)) {
      const key = pageUrlOf(p);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    map.forEach((list) => {
      list.sort((a, b) => (a.orderNo || 0) - (b.orderNo || 0));
    });
    return map;
  }, [visiblePermissions]);

  const groupedPages = useMemo(() => {
    return pagePermissions.reduce((acc, perm) => {
      const module = perm.moduleName || "General";
      if (!acc[module]) acc[module] = [];
      acc[module].push(perm);
      return acc;
    }, {} as Record<string, PermissionDetail[]>);
  }, [pagePermissions]);

  const handlePageToggle = (page: PermissionDetail) => {
    setIsDirty(true);
    const actions = actionsByPage.get(pageUrlOf(page)) || [];
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      const turningOn = !next.has(page.permissionId);
      if (turningOn) {
        next.add(page.permissionId);
        // Default: grant all Level-2 actions when enabling a page
        actions.forEach((a) => next.add(a.permissionId));
      } else {
        next.delete(page.permissionId);
        actions.forEach((a) => next.delete(a.permissionId));
      }
      return next;
    });
  };

  const handleActionToggle = (page: PermissionDetail, action: PermissionDetail) => {
    setIsDirty(true);
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(action.permissionId)) {
        next.delete(action.permissionId);
      } else {
        next.add(action.permissionId);
        next.add(page.permissionId); // ensure Level-1 parent
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setIsDirty(true);
    const ids = visiblePermissions.map((p) => p.permissionId);
    const allSelected = ids.every((id) => selectedPermissions.has(id));
    if (allSelected) {
      setSelectedPermissions(new Set());
    } else {
      setSelectedPermissions(new Set(ids));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let ids = Array.from(selectedPermissions);
      if (!targetIsAdmin) {
        const banned = new Set(
          allPermissions.filter(isAdminOnlyPerm).map((p) => p.permissionId)
        );
        ids = ids.filter((id) => !banned.has(id));
      }

      const request: AssignPermissionsRequest = {
        roleId,
        tenantId,
        permissionIds: ids
      };

      await UserManagementService.AssignPermissionsToRole(request);
      toast.success(
        "Permissions updated. Users must sign out and sign in again for changes to take effect."
      );
      onSave();
    } catch (error: any) {
      console.error("Error saving permissions:", error);
      toast.error(`Error saving permissions: ${error.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const selectedVisibleCount = visiblePermissions.filter((p) =>
    selectedPermissions.has(p.permissionId)
  ).length;

  if (loading) {
    return (
      <div className="role-permission-manager-overlay">
        <div className="role-permission-manager-panel">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading permissions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="role-permission-manager-overlay" onClick={onBackdropClick(handleDismiss)}>
      <div className="role-permission-manager-panel">
        <div className="role-permission-manager-header">
          <h2>Manage Permissions: {roleName}</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
            {allPermissions.length > 0 ? (
              <button
                className="btn btn-sm btn-warning"
                onClick={async () => {
                  if (
                    !window.confirm(
                      `This will clear role assignments for this tenant and reseed permission definitions.\n\n` +
                        `Admin roles get all pages + actions; other roles get Dashboard only.\n\n` +
                        `User Management stays administrator-only.\n\nContinue?`
                    )
                  ) {
                    return;
                  }
                  try {
                    toast.info("Clearing and reseeding permissions...");
                    const result = await UserManagementService.SeedPermissions(true);
                    toast.success(
                      result.message ||
                        "Permissions cleared and reseeded. Admin roles have full access; others have Dashboard only."
                    );
                    await loadData();
                  } catch (error: any) {
                    toast.error(
                      `Failed to clear and reseed permissions: ${error.message || "Unknown error"}`
                    );
                  }
                }}
                style={{
                  fontSize: "0.875rem",
                  padding: "0.5rem 1rem",
                  backgroundColor: "#f59e0b",
                  color: "white",
                  border: "2px solid #d97706",
                  borderRadius: "0.375rem",
                  fontWeight: 600
                }}
              >
                Clear &amp; Reseed
              </button>
            ) : null}
            <button className="close-button" onClick={handleDismiss} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <div className="role-permission-manager-content">
          {visiblePermissions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <p style={{ color: "#6b7280", marginBottom: "1rem" }}>
                No permissions found. Seed the catalog to continue.
              </p>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    const result = await UserManagementService.SeedPermissions();
                    toast.success(result.message || "Permissions seeded");
                    await loadData();
                  } catch (error: any) {
                    toast.error(`Failed to seed: ${error.message || "Unknown error"}`);
                  }
                }}
              >
                Seed Permissions
              </button>
            </div>
          ) : (
            <>
              <div className="permission-actions">
                <button
                  type="button"
                  className="btn btn-sm permission-select-all-btn"
                  onClick={handleSelectAll}
                >
                  {selectedVisibleCount === visiblePermissions.length
                    ? "Deselect All"
                    : "Select All"}
                </button>
                <span className="permission-count">
                  {selectedVisibleCount} of {visiblePermissions.length} selected
                  {" · "}
                  Level 1 = page (View), Level 2 = actions
                </span>
              </div>

              {!targetIsAdmin && (
                <p className="permission-admin-note">
                  User Management is administrator-only and cannot be granted to this role.
                </p>
              )}

              <div className="permissions-list">
                {Object.entries(groupedPages).map(([module, pages]) => (
                  <div key={module} className="permission-module">
                    <h3>{module}</h3>
                    <div className="permission-pages">
                      {pages
                        .sort((a, b) => (a.orderNo || 0) - (b.orderNo || 0))
                        .map((page) => {
                          const actions = actionsByPage.get(pageUrlOf(page)) || [];
                          const pageOn = selectedPermissions.has(page.permissionId);
                          return (
                            <div key={page.permissionId} className="permission-page-card">
                              <label className="permission-item permission-page">
                                <input
                                  type="checkbox"
                                  checked={pageOn}
                                  onChange={() => handlePageToggle(page)}
                                />
                                <span className="permission-name">
                                  {page.displayName || page.permissionName}
                                </span>
                                <span className="permission-level permission-level--l1" title="Page access">
                                  Level 1
                                </span>
                              </label>
                              {actions.length > 0 && (
                                <div
                                  className={`permission-actions-row ${
                                    pageOn ? "" : "permission-actions-row--disabled"
                                  }`}
                                >
                                  <div className="permission-actions-heading">
                                    <span className="permission-level permission-level--l2" title="Action permissions">
                                      Level 2
                                    </span>
                                  </div>
                                  {actions.map((action) => (
                                    <label
                                      key={action.permissionId}
                                      className="permission-item permission-action"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedPermissions.has(action.permissionId)}
                                        disabled={!pageOn}
                                        onChange={() => handleActionToggle(page, action)}
                                      />
                                      <span className="permission-name">
                                        {action.displayName || action.permissionName}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="role-permission-manager-footer">
          <button className="btn btn-secondary" onClick={handleDismiss} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? (
              "Saving..."
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
