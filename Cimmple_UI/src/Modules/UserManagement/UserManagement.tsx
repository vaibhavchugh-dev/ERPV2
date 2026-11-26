import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { UserManagementService, UserManagement as UserManagementType, UserQueryParams, PaginatedUsersResponse, Role, LoginSeatUsage } from "../../Common/Services/UserManagementService";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import UserManagementSlideout from "./UserManagementSlideout";
import RolePermissionManager from "./RolePermissionManager";
import RoleManager from "./RoleManager";
import ResetPasswordModal, { ResetPasswordUser } from "./ResetPasswordModal";
import { formatDate } from "../../Common/Utils/Formatting";
import SortableTh from "../../Common/Components/SortableTh";
import { useTableSort } from "../../Common/Hooks/useTableSort";
import { rowClickHandler } from "../../Common/Utils/rowClick";
import { AuthService } from "../../Common/Services/AuthService";
import { isAdminRoleName } from "../../Common/Utils/accountProtection";
import "./UserManagement.scss";

const UserManagementComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const isAdminSession = AuthService.isAdminSession();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [users, setUsers] = useState<UserManagementType[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [resetPasswordUser, setResetPasswordUser] = useState<ResetPasswordUser | null>(null);
  const [seatUsage, setSeatUsage] = useState<LoginSeatUsage | null>(null);

  const loadSeatUsage = useCallback(async () => {
    try {
      setSeatUsage(await UserManagementService.GetLoginSeatUsage());
    } catch {
      setSeatUsage(null);
    }
  }, []);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedUserId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [pagination, setPagination] = useState({
    totalCount: 0,
    pageNumber: 1,
    pageSize: 10,
    totalPages: 0
  });
  const [showRolePermissionManager, setShowRolePermissionManager] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<number>(0);
  const [showRoleManager, setShowRoleManager] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesMap, setRolesMap] = useState<{ [key: number]: string }>({});
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    const delay = trimmed === "" ? 0 : 300;
    const timer = window.setTimeout(() => {
      setDebouncedSearch(trimmed);
      setPagination((prev) =>
        prev.pageNumber === 1 ? prev : { ...prev, pageNumber: 1 }
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadUsers();
    loadRoles();
    void loadSeatUsage();
  }, [debouncedSearch, filterValue, pagination.pageNumber, locationIdParam, loadSeatUsage]);

  useEffect(() => {
    // Create a map of role IDs to role names for quick lookup
    const map: { [key: number]: string } = {};
    roles.forEach(role => {
      const roleId = Number(role.id);
      if (roleId > 0 && role.name) {
        map[roleId] = role.name;
      }
    });
    setRolesMap(map);
  }, [roles]);

  const loadRoles = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;
      const rolesData = await UserManagementService.GetRoles(tenantID);
      setRoles(rolesData);
    } catch (error: any) {
      console.error('Error loading roles:', error);
      // Don't show error toast, just log it
    }
  };

  const loadUsers = async () => {
    const requestId = ++loadRequestIdRef.current;
    if (!hasLoadedOnce) setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;

      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1;
        console.log('[UserManagement] Using default tenantID:', tenantID);
      }

      const params: UserQueryParams = {
        tenantid: tenantID,
        searchTerm: debouncedSearch || undefined,
        status: filterValue !== "all" ? filterValue : undefined,
        pageNumber: pagination.pageNumber,
        pageSize: pagination.pageSize,
        locationId: locationIdParam,
      };

      console.log('[UserManagement] Loading users with params:', params);
      const result: PaginatedUsersResponse = await UserManagementService.GetUsers(params);
      if (requestId !== loadRequestIdRef.current) return;
      console.log('[UserManagement] API response:', result);

      if (result && result.users) {
        setUsers(result.users);
        setPagination(result.pagination);
        console.log('[UserManagement] Loaded', result.users.length, 'users');
      } else {
        console.warn('[UserManagement] Invalid response from API:', result);
        setUsers([]);
      }
    } catch (error: any) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error('[UserManagement] Error loading users:', error);
      toast.error(`Error loading users: ${error.message || 'Unknown error'}`);
      setUsers([]);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setHasLoadedOnce(true);
        setLoading(false);
      }
    }
  };

  // Note: Users are created via Employee Master
  // User Management focuses on account management (roles, permissions, status, security)

  const handleEditUser = (userId: number, roleName?: string) => {
    if (!isAdminSession && isAdminRoleName(roleName)) {
      toast.error("Only an administrator can edit an Admin account.");
      return;
    }
    setSelectedUserId(userId);
    setShowSlideout(true);
  };

  const handleDeleteUser = async (userId: number, roleName?: string) => {
    if (!isAdminSession && isAdminRoleName(roleName)) {
      toast.error("Only an administrator can deactivate an Admin account.");
      return;
    }
    if (!window.confirm("Are you sure you want to deactivate this user?")) {
      return;
    }

    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;

      await UserManagementService.DeleteUser(userId, tenantID);
      toast.success("User deactivated successfully");
      loadUsers();
      void loadSeatUsage();
    } catch (error: any) {
      console.error('[UserManagement] Error deleting user:', error);
      toast.error(`Error deactivating user: ${error?.response?.data?.message || error.message || 'Unknown error'}`);
    }
  };

  const getRoleName = (roleId?: number, roleName?: string) => {
    if (roleName && roleName.trim()) return roleName;
    const id = Number(roleId);
    if (!id || id === 0) return 'Unknown';
    return rolesMap[id] || 'Unknown';
  };

  const handleResetPassword = (user: UserManagementType) => {
    const roleLabel = getRoleName(user.role, user.roleName);
    if (!isAdminSession && isAdminRoleName(roleLabel)) {
      toast.error("Only an administrator can reset an Admin account password.");
      return;
    }
    const displayName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    setResetPasswordUser({
      userId: user.userUniqueID,
      userName: user.userName,
      displayName: displayName || undefined,
      email: user.email,
    });
  };

  const handleManageRolePermissions = (roleId: number, roleName?: string) => {
    if (!isAdminSession) {
      toast.error("Only an administrator can manage roles and permissions.");
      return;
    }
    setSelectedRoleId(roleId);
    setShowRolePermissionManager(true);
  };

  const getUserSortValue = useCallback(
    (user: UserManagementType, key: string): unknown => {
      if (key === "role") return getRoleName(user.role, user.roleName);
      if (key === "fullName") return `${user.firstName || ""} ${user.lastName || ""}`.trim();
      return user[key as keyof UserManagementType];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rolesMap]
  );
  const { sortedRows: sortedUsers, sortKey, sortDirection, toggleSort, tableRef } = useTableSort(
    users,
    getUserSortValue
  );
  const sortProps = { activeKey: sortKey, direction: sortDirection, onSort: toggleSort };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, pageNumber: page }));
  };

  const getStatusBadge = (status?: string) => {
    const statusClass = status?.toLowerCase() === 'active' ? 'status-active' :
                       status?.toLowerCase() === 'inactive' ? 'status-inactive' : 'status-pending';
    return <span className={`status-badge ${statusClass}`}>{status || 'Unknown'}</span>;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
            Manage user accounts, roles, and permissions. Users are created via <strong>Employee Master</strong>.
          </p>
          <p style={{ fontSize: '0.875rem', color: '#374151', margin: '0.35rem 0 0 0' }}>
            {seatUsage == null
              ? "Login seats: …"
              : (seatUsage.loginSeatLimit ?? 0) <= 0
                ? "Login seats: none allotted."
                : `Login seats: ${seatUsage.usedSeats} of ${seatUsage.loginSeatLimit} used · ${seatUsage.availableSeats} available`}
          </p>
        </div>
        <div className="page-actions">
          {isAdminSession && (
            <button className="btn btn-secondary" onClick={() => setShowRoleManager(true)}>
              <i className="fas fa-user-tag"></i> Manage Roles
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        <div className="filters-section">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <i className="fas fa-search search-icon"></i>
          </div>

          <div className="filter-container">
            <select
              value={masterListFilter.value}
              onChange={(e) => {
                masterListFilter.onChange(e.target.value);
                setPagination((prev) => ({ ...prev, pageNumber: 1 }));
              }}
              className="filter-select"
            >
              {masterListFilter.options.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-container">
            <select
              value={filterValue}
              onChange={(e) => {
                setFilterValue(e.target.value);
                setPagination((prev) => ({ ...prev, pageNumber: 1 }));
              }}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <div className="page-loading">
              <div className="loading-spinner"></div>
              <p>Loading users...</p>
            </div>
          ) : (
            <>
              <table className="data-table" ref={tableRef}>
                <thead>
                  <tr>
                    <SortableTh sortKey="userName" {...sortProps}>Username</SortableTh>
                    <SortableTh sortKey="fullName" {...sortProps}>Full Name</SortableTh>
                    <SortableTh sortKey="email" {...sortProps}>Email</SortableTh>
                    <SortableTh sortKey="role" {...sortProps}>Role</SortableTh>
                    <SortableTh sortKey="status" {...sortProps}>Status</SortableTh>
                    <SortableTh sortKey="createDate" {...sortProps}>Created Date</SortableTh>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="no-data">
                        {loading ? 'Loading...' : 'No users found'}
                      </td>
                    </tr>
                  ) : (
                    sortedUsers.map((user) => (
                      <tr
                        key={user.userUniqueID}
                        className="clickable"
                        onClick={rowClickHandler(() =>
                          handleEditUser(user.userUniqueID, getRoleName(user.role, user.roleName))
                        )}
                      >
                        <td>{user.userName || '-'}</td>
                        <td>{`${user.firstName || ''} ${user.lastName || ''}`.trim() || '-'}</td>
                        <td>{user.email || '-'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{getRoleName(user.role, user.roleName)}</span>
                            {isAdminSession && (
                              <button
                                className="btn btn-sm btn-info"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleManageRolePermissions(
                                    user.role || 0,
                                    getRoleName(user.role, user.roleName)
                                  );
                                }}
                                title="Manage permissions for this role"
                                disabled={!user.role || user.role === 0}
                              >
                                <i className="fas fa-cog"></i>
                              </button>
                            )}
                          </div>
                        </td>
                        <td>{getStatusBadge(user.status)}</td>
                        <td>{user.createDate ? formatDate(user.createDate) : '-'}</td>
                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary action-icon-btn"
                              onClick={() =>
                                handleEditUser(
                                  user.userUniqueID,
                                  getRoleName(user.role, user.roleName)
                                )
                              }
                              title={
                                !isAdminSession &&
                                isAdminRoleName(getRoleName(user.role, user.roleName))
                                  ? "Only an administrator can edit an Admin account"
                                  : "Edit User"
                              }
                              disabled={
                                !isAdminSession &&
                                isAdminRoleName(getRoleName(user.role, user.roleName))
                              }
                            >
                              <i className="fas fa-fw fa-edit" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-warning action-icon-btn"
                              onClick={() => handleResetPassword(user)}
                              title={
                                !isAdminSession &&
                                isAdminRoleName(getRoleName(user.role, user.roleName))
                                  ? "Only an administrator can reset an Admin password"
                                  : "Reset Password"
                              }
                              disabled={
                                !isAdminSession &&
                                isAdminRoleName(getRoleName(user.role, user.roleName))
                              }
                            >
                              <i className="fas fa-fw fa-key" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger action-icon-btn"
                              onClick={() =>
                                handleDeleteUser(
                                  user.userUniqueID,
                                  getRoleName(user.role, user.roleName)
                                )
                              }
                              title={
                                !isAdminSession &&
                                isAdminRoleName(getRoleName(user.role, user.roleName))
                                  ? "Only an administrator can deactivate an Admin account"
                                  : "Deactivate User"
                              }
                              disabled={
                                !isAdminSession &&
                                isAdminRoleName(getRoleName(user.role, user.roleName))
                              }
                            >
                              <i className="fas fa-fw fa-user-slash" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="pagination-container">
                  <button
                    className="btn btn-sm"
                    disabled={pagination.pageNumber <= 1}
                    onClick={() => handlePageChange(pagination.pageNumber - 1)}
                  >
                    <i className="fas fa-chevron-left"></i>
                  </button>

                  <span className="pagination-info">
                    Page {pagination.pageNumber} of {pagination.totalPages} ({pagination.totalCount} total)
                  </span>

                  <button
                    className="btn btn-sm"
                    disabled={pagination.pageNumber >= pagination.totalPages}
                    onClick={() => handlePageChange(pagination.pageNumber + 1)}
                  >
                    <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showSlideout && (
        <UserManagementSlideout
          userId={selectedUserId}
          onClose={() => {
            setShowSlideout(false);
            setSelectedUserId(0);
          }}
          onSave={() => {
            loadUsers();
            void loadSeatUsage();
            setShowSlideout(false);
            setSelectedUserId(0);
          }}
        />
      )}

      {showRoleManager && (
        <RoleManager
          onClose={() => setShowRoleManager(false)}
          onSave={() => {
            loadRoles();
            loadUsers();
          }}
          onManagePermissions={(roleId) => {
            setSelectedRoleId(roleId);
            setShowRolePermissionManager(true);
          }}
        />
      )}

      {showRolePermissionManager && (
        <RolePermissionManager
          roleId={selectedRoleId}
          tenantId={JSON.parse(localStorage.getItem("storage") || "{}")?.tenantID || 1}
          onClose={() => {
            setShowRolePermissionManager(false);
            setSelectedRoleId(0);
          }}
          onSave={() => {
            setShowRolePermissionManager(false);
            setSelectedRoleId(0);
            loadUsers();
            loadRoles();
          }}
        />
      )}

      {resetPasswordUser && (
        <ResetPasswordModal
          user={resetPasswordUser}
          onClose={() => setResetPasswordUser(null)}
        />
      )}
    </div>
  );
};

export default UserManagementComponent;
