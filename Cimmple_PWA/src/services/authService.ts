export interface AuthLocation {
  locationId: number;
  name: string;
  code: string;
  locType: number;
}

export interface AuthPermission {
  permissionId: number;
  permissionName: string;
  url?: string;
  reportGroup?: string;
}

export interface AuthUser {
  userId: number;
  userName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  tenantId: number;
  roleId?: number;
  roleName?: string;
  canAccessAllLocations: boolean;
  defaultLocationId?: number;
  mustChangePassword: boolean;
  vendorId?: number;
  vendorCode?: string;
  portalType: string;
  locations: AuthLocation[];
  permissions: AuthPermission[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresAtUtc: string;
  sessionTimeoutMinutes: number;
  user: AuthUser;
}

export interface SessionStorage {
  userName: string;
  userLogin: string;
  email: string;
  tenantID: number;
  rolId: number;
  role: string;
  userId: number;
  user_UniqueID: string;
  canAccessAllLocations: boolean;
  defaultLocationId: number;
  mustChangePassword: boolean;
  portalType: string;
  sessionTimeoutMinutes: number;
  expiresAtUtc: string;
}

const STORAGE_KEY = "storage";
const TOKEN_KEY = "token";
const REFRESH_KEY = "refreshToken";
const PERMS_KEY = "permissions";
const LOCATIONS_KEY = "allowedLocations";

export class AuthService {
  public static persistSession(response: LoginResponse) {
    const user = response.user;
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.userName;

    const storage: SessionStorage = {
      userName: displayName,
      userLogin: user.userName,
      email: user.email || "",
      tenantID: user.tenantId,
      rolId: user.roleId || 0,
      role: user.roleName || "",
      userId: user.userId,
      user_UniqueID: String(user.userId),
      canAccessAllLocations: user.canAccessAllLocations,
      defaultLocationId: user.defaultLocationId || 0,
      mustChangePassword: user.mustChangePassword,
      portalType: user.portalType || "erp",
      sessionTimeoutMinutes: response.sessionTimeoutMinutes,
      expiresAtUtc: response.expiresAtUtc,
    };

    localStorage.setItem(TOKEN_KEY, response.accessToken);
    localStorage.setItem(REFRESH_KEY, response.refreshToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    localStorage.setItem(PERMS_KEY, JSON.stringify(user.permissions || []));
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(user.locations || []));

    const serverDefault =
      user.defaultLocationId || user.locations?.[0]?.locationId || 0;
    if (serverDefault > 0) {
      localStorage.setItem("defaultLocationId", String(serverDefault));
    }

    const existingLocationId = Number(localStorage.getItem("locationId") || 0);
    const allowedIds = new Set((user.locations || []).map((l) => l.locationId));
    const existingStillValid =
      existingLocationId > 0 &&
      (user.canAccessAllLocations || allowedIds.has(existingLocationId));

    if (!existingStillValid && serverDefault > 0) {
      localStorage.setItem("locationId", String(serverDefault));
    }
  }

  public static clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PERMS_KEY);
    localStorage.removeItem(LOCATIONS_KEY);
    localStorage.removeItem("locationId");
    localStorage.removeItem("defaultLocationId");
  }

  public static getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  public static getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  public static isAuthenticated(): boolean {
    return Boolean(AuthService.getToken());
  }

  public static getStorage(): SessionStorage | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SessionStorage;
    } catch {
      return null;
    }
  }

  public static getTenantId(): number {
    return AuthService.getStorage()?.tenantID || 0;
  }

  public static getUserId(): number {
    return AuthService.getStorage()?.userId || 0;
  }

  public static getUserName(): string {
    const s = AuthService.getStorage();
    return s?.userName || s?.userLogin || "";
  }

  public static getLocationId(): number {
    return Number(localStorage.getItem("locationId") || 0);
  }

  public static getAllowedLocations(): AuthLocation[] {
    try {
      return JSON.parse(localStorage.getItem(LOCATIONS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  public static setLocationId(locationId: number) {
    localStorage.setItem("locationId", String(locationId));
  }
}
