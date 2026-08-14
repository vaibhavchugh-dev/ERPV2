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
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresAtUtc: string;
  sessionTimeoutMinutes: number;
  user: AuthUser;
}

export interface VendorSessionStorage {
  userName: string;
  userLogin: string;
  email: string;
  tenantID: number;
  rolId: number;
  role: string;
  userId: number;
  user_UniqueID: string;
  vendorId: number | null;
  vendorCode: string;
  portalType: string;
  sessionTimeoutMinutes: number;
  expiresAtUtc: string;
}

const TOKEN_KEY = "vendorToken";
const REFRESH_KEY = "vendorRefreshToken";
const STORAGE_KEY = "vendorStorage";

export class AuthService {
  public static persistSession(response: LoginResponse, vendorCodeFallback?: string) {
    const user = response.user;
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.userName;
    const vendorCode = user.vendorCode || vendorCodeFallback || "";

    const storage: VendorSessionStorage = {
      userName: displayName,
      userLogin: user.userName,
      email: user.email || "",
      tenantID: user.tenantId,
      rolId: user.roleId || 0,
      role: user.roleName || "",
      userId: user.userId,
      user_UniqueID: String(user.userId),
      vendorId: user.vendorId || null,
      vendorCode,
      portalType: user.portalType || "vendor",
      sessionTimeoutMinutes: response.sessionTimeoutMinutes,
      expiresAtUtc: response.expiresAtUtc,
    };

    localStorage.setItem(TOKEN_KEY, response.accessToken);
    localStorage.setItem(REFRESH_KEY, response.refreshToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  }

  public static clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(STORAGE_KEY);
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

  public static getStorage(): VendorSessionStorage | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as VendorSessionStorage;
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

  public static getVendorCode(): string {
    return AuthService.getStorage()?.vendorCode || "";
  }
}
