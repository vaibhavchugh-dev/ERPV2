import Instense from "./Axios-config";

export interface UserManagement {
  userUniqueID: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  userName?: string;
  status?: string;
  role?: number;
  roleName?: string;
  phone1?: string;
  employeeType?: string;
  dateOfHire?: string;
  createDate?: Date;
  isSalesAgent?: number;
}

export interface UserDetail {
  userUniqueID: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  userName?: string;
  password?: string;
  status?: string;
  role?: number;
  roleName?: string;
  phone1?: string;
  phone2?: string;
  employeeType?: string;
  dateOfHire?: string;
  dateOfTermination?: string;
  terminationReason?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  street?: string;
  primaryContact?: string;
  dob?: string;
  ssn?: string;
  isSalesAgent?: number;
  allowPTO?: number;
  allowPerformance?: number;
  sendWelcomeEmail?: number;
  createDate?: Date;
}

// Note: CreateUserRequest removed - users are created via Employee Master
// User Management focuses on account management (roles, permissions, status, security)

export interface UpdateUserRequest {
  userUniqueID: number;
  tenantID: number;
  // Account Management Fields Only
  status?: string;
  role?: number;
  isSalesAgent: boolean;
  allowPTO: boolean;
  allowPerformance: boolean;
  terminationReason?: string;
  // Note: Profile data (name, email, phone, address) should be managed via Employee Master
}

export interface ResetPasswordRequest {
  userId: number;
  tenantId: number;
  newPassword?: string;
}

export interface Role {
  id: number;
  name?: string;
  description?: string;
}

export interface Permission {
  permissionId: number;
  permissionName?: string;
  displayName?: string;
  levelInfo: number;
}

export interface PermissionDetail extends Permission {
  orderNo?: number;
  moduleName?: string;
}

export interface AssignPermissionsRequest {
  roleId: number;
  tenantId: number;
  permissionIds: number[];
}

export interface CreateRoleRequest {
  roleName: string;
  description?: string;
  tenantId: number;
  orderNo?: number;
  resetPwd?: string;
}

export interface UpdateRoleRequest {
  roleId: number;
  tenantId: number;
  roleName?: string;
  description?: string;
  orderNo?: number;
  resetPwd?: string;
}

export interface UserQueryParams {
  tenantid: number;
  searchTerm?: string;
  status?: string;
  pageNumber?: number;
  pageSize?: number;
}

export interface PaginatedUsersResponse {
  users: UserManagement[];
  pagination: {
    totalCount: number;
    pageNumber: number;
    pageSize: number;
    totalPages: number;
  };
}

export class UserManagementService {
  public static async GetUsers(params: UserQueryParams): Promise<PaginatedUsersResponse> {
    const url = `/UserManagement/GetUsers`;
    const response = await Instense.get(url, {
      params: {
        tenantId: params.tenantid,
        ...(params.searchTerm && { searchTerm: params.searchTerm }),
        ...(params.status && { status: params.status }),
        pageNumber: params.pageNumber || 1,
        pageSize: params.pageSize || 10
      }
    });
    return response.data;
  }

  public static async GetUserById(userId: number, tenantId: number): Promise<UserDetail> {
    const url = `/UserManagement/GetUserById`;
    const response = await Instense.get(url, {
      params: {
        userId,
        tenantId
      }
    });
    return response.data;
  }

  // Note: CreateUser removed - users are created via Employee Master
  // User Management focuses on account management (roles, permissions, status, security)

  public static async UpdateUser(userData: UpdateUserRequest): Promise<{ message: string }> {
    const url = `/UserManagement/UpdateUser`;
    const response = await Instense.put(url, userData);
    return response.data;
  }

  public static async DeleteUser(userId: number, tenantId: number): Promise<{ message: string }> {
    const url = `/UserManagement/DeleteUser`;
    const response = await Instense.delete(url, {
      params: {
        userId,
        tenantId
      }
    });
    return response.data;
  }

  public static async ResetPassword(resetData: ResetPasswordRequest): Promise<{ message: string }> {
    const url = `/UserManagement/ResetPassword`;
    const response = await Instense.post(url, resetData);
    return response.data;
  }

  public static async GetRoles(tenantId?: number): Promise<Role[]> {
    const url = `/UserManagement/GetRoles`;
    const params: any = {};
    if (tenantId) {
      params.tenantId = tenantId;
    }
    const response = await Instense.get(url, { params });
    return response.data;
  }

  public static async GetPermissionsByRole(roleId: number, tenantId: number): Promise<Permission[]> {
    const url = `/UserManagement/GetPermissionsByRole`;
    const response = await Instense.get(url, {
      params: {
        roleId,
        tenantId
      }
    });
    return response.data;
  }

  public static async GetAllPermissions(tenantId?: number): Promise<PermissionDetail[]> {
    const url = `/UserManagement/GetAllPermissions`;
    const params: any = {};
    if (tenantId) {
      params.tenantId = tenantId;
    }
    const response = await Instense.get(url, { params });
    return response.data;
  }

  public static async AssignPermissionsToRole(request: AssignPermissionsRequest): Promise<{ message: string }> {
    const url = `/UserManagement/AssignPermissionsToRole`;
    const response = await Instense.post(url, request);
    return response.data;
  }

  public static async CreateRole(request: CreateRoleRequest): Promise<{ message: string; role: Role }> {
    const url = `/UserManagement/CreateRole`;
    const response = await Instense.post(url, request);
    return response.data;
  }

  public static async UpdateRole(request: UpdateRoleRequest): Promise<{ message: string }> {
    const url = `/UserManagement/UpdateRole`;
    const response = await Instense.put(url, request);
    return response.data;
  }

  public static async DeleteRole(roleId: number, tenantId: number): Promise<{ message: string }> {
    const url = `/UserManagement/DeleteRole`;
    const response = await Instense.delete(url, {
      params: {
        roleId,
        tenantId
      }
    });
    return response.data;
  }

  public static async SeedPermissions(clearExisting: boolean = false): Promise<{ message: string; count?: number; clearExisting?: boolean }> {
    const url = `/UserManagement/SeedPermissions${clearExisting ? '?clearExisting=true' : ''}`;
    console.log('[UserManagementService] SeedPermissions called with clearExisting:', clearExisting, 'URL:', url);
    const response = await Instense.post(url);
    console.log('[UserManagementService] SeedPermissions response:', response.data);
    return response.data;
  }

  public static async ClearPermissions(): Promise<{ message: string; permissionsCleared?: number; roleAssignmentsCleared?: number }> {
    const url = `/UserManagement/ClearPermissions`;
    const response = await Instense.delete(url);
    return response.data;
  }
}
