import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { UserManagementService, UserManagement as UserManagementType, UserQueryParams, PaginatedUsersResponse, Role } from "../../Common/Services/UserManagementService";
import UserManagementSlideout from "./UserManagementSlideout";
import RolePermissionManager from "./RolePermissionManager";
import RoleManager from "./RoleManager";
import ResetPasswordModal, { ResetPasswordUser } from "./ResetPasswordModal";
import "./UserManagement.scss";

const UserManagementComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [users, setUsers] = useState<UserManagementType[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [resetPasswordUser, setResetPasswordUser] = useState<ResetPasswordUser | null>(null);

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
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [sortColumn, setSortColumn] = useState<keyof UserManagementType | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
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

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, [searchTerm, filterValue, pagination.pageNumber]);

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
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;

      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1;
        console.log('[UserManagement] Using default tenantID:', tenantID);
      }

      const params: UserQueryParams = {
        tenantid: tenantID,
        searchTerm: searchTerm || undefined,
        status: filterValue !== "all" ? filterValue : undefined,
        pageNumber: pagination.pageNumber,
        pageSize: pagination.pageSize
      };

      console.log('[UserManagement] Loading users with params:', params);
      const result: PaginatedUsersResponse = await UserManagementService.GetUsers(params);
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
      console.error('[UserManagement] Error loading users:', error);
      toast.error(`Error loading users: ${error.message || 'Unknown error'}`);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // Note: Users are created via Employee Master
  // User Management focuses on account management (roles, permissions, status, security)

  const handleEditUser = (userId: number) => {
    setSelectedUserId(userId);
    setShowSlideout(true);
  };

  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm("Are you sure you want to deactivate this user?")) {
      return;
    }

    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;

      await UserManagementService.DeleteUser(userId, tenantID);
      toast.success("User deactivated successfully");
      loadUsers();
    } catch (error: any) {
      console.error('[UserManagement] Error deleting user:', error);
      toast.error(`Error deactivating user: ${error.message || 'Unknown error'}`);
    }
  };

  const handleResetPassword = (user: UserManagementType) => {
    const displayName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    setResetPasswordUser({
      userId: user.userUniqueID,
      userName: user.userName,
      displayName: displayName || undefined,
    });
  };

  const handleSort = (column: keyof UserManagementType) => {
    const direction = sortColumn === column && sortDirection === "asc" ? "desc" : "asc";
    setSortColumn(column);
    setSortDirection(direction);

    const sorted = [...users].sort((a, b) => {
      const aVal = a[column];
      const bVal = b[column];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });

    setUsers(sorted);
  };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, pageNumber: page }));
  };

  const handleManageRolePermissions = (roleId: number) => {
    setSelectedRoleId(roleId);
    setShowRolePermissionManager(true);
  };

  const getStatusBadge = (status?: string) => {
    const statusClass = status?.toLowerCase() === 'active' ? 'status-active' :
                       status?.toLowerCase() === 'inactive' ? 'status-inactive' : 'status-pending';
    return <span className={`status-badge ${statusClass}`}>{status || 'Unknown'}</span>;
  };

  const getRoleName = (roleId?: number, roleName?: string) => {
    if (roleName && roleName.trim()) return roleName;
    const id = Number(roleId);
    if (!id || id === 0) return 'Unknown';
    return rolesMap[id] || 'Unknown';
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
            Manage user accounts, roles, and permissions. Users are created via <strong>Employee Master</strong>.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => setShowRoleManager(true)}>
            <i className="fas fa-user-tag"></i> Manage Roles
          </button>
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
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
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
              <table className="data-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('userName')} className="sortable">
                      Username {sortColumn === 'userName' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('firstName')} className="sortable">
                      Full Name {sortColumn === 'firstName' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('email')} className="sortable">
                      Email {sortColumn === 'email' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('role')} className="sortable">
                      Role {sortColumn === 'role' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('status')} className="sortable">
                      Status {sortColumn === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('createDate')} className="sortable">
                      Created Date {sortColumn === 'createDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="no-data">
                        {loading ? 'Loading...' : 'No users found'}
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.userUniqueID}>
                        <td>{user.userName || '-'}</td>
                        <td>{`${user.firstName || ''} ${user.lastName || ''}`.trim() || '-'}</td>
                        <td>{user.email || '-'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{getRoleName(user.role, user.roleName)}</span>
                            <button
                              className="btn btn-xs btn-info"
                              onClick={() => handleManageRolePermissions(user.role || 0)}
                              title="Manage permissions for this role"
                              disabled={!user.role || user.role === 0}
                              style={{ minWidth: '32px', padding: '0.25rem 0.5rem' }}
                            >
                              <i className="fas fa-cog" style={{ fontSize: '0.75rem' }}></i>
                            </button>
                          </div>
                        </td>
                        <td>{getStatusBadge(user.status)}</td>
                        <td>{user.createDate ? new Date(user.createDate).toLocaleDateString() : '-'}</td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleEditUser(user.userUniqueID)}
                              title="Edit User"
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-warning"
                              onClick={() => handleResetPassword(user)}
                              title="Reset Password"
                            >
                              <i className="fas fa-key"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDeleteUser(user.userUniqueID)}
                              title="Deactivate User"
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
