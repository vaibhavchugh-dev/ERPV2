export interface AuthLocation {
  locationId: number;
  name: string;
  code: string;
  locType: number;
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
  portalType: string;
  locations: AuthLocation[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresAtUtc: string;
  sessionTimeoutMinutes: number;
  user: AuthUser;
}

export interface PunchStorage {
  user_UniqueID: number;
  userName: string;
  tenantID: number;
  rolId: number;
  role?: string;
  companyName: string;
  name: string;
  timeZone: string;
  currentUtcTime: string;
  expiresAt: number;
}

const STORAGE_KEY = "storage";
const TOKEN_KEY = "token";
const REFRESH_KEY = "refreshToken";
export const PUNCH_STORAGE_KEY = "punchStorage";
export const PUNCH_TOKEN_KEY = "punchToken";
export const PUNCH_SESSION_COOKIE = "punchSession";
export const PUNCH_ADMIN_UNLOCK_KEY = "punchAdminUnlocked";
export const PUNCH_SESSION_DAYS = 30;
const PUNCH_SESSION_MAX_AGE_MS = PUNCH_SESSION_DAYS * 24 * 60 * 60 * 1000;

export function isAdminRole(roleId?: number, roleName?: string): boolean {
  if (roleId === 1) return true;
  const name = (roleName || "").toLowerCase();
  return name.includes("admin");
}

export class AuthService {
  public static persistSession(response: LoginResponse) {
    const user = response.user;
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.userName;
    const expiresAt = Date.now() + PUNCH_SESSION_MAX_AGE_MS;
    const rolId = user.roleId || 0;

    const storage = {
      userName: user.userName,
      userLogin: user.userName,
      email: user.email || "",
      tenantID: user.tenantId,
      rolId,
      role: user.roleName || "",
      userId: user.userId,
      user_UniqueID: String(user.userId),
      canAccessAllLocations: user.canAccessAllLocations,
      defaultLocationId: user.defaultLocationId || 0,
      portalType: user.portalType || "erp",
      sessionTimeoutMinutes: response.sessionTimeoutMinutes,
      expiresAtUtc: response.expiresAtUtc,
    };

    const punchStorage: PunchStorage = {
      user_UniqueID: user.userId,
      userName: user.userName,
      tenantID: user.tenantId,
      rolId,
      role: user.roleName,
      companyName: displayName,
      name: displayName,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      currentUtcTime: Intl.DateTimeFormat().resolvedOptions().timeZone,
      expiresAt,
    };

    localStorage.setItem(TOKEN_KEY, response.accessToken);
    localStorage.setItem(REFRESH_KEY, response.refreshToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    localStorage.setItem(PUNCH_STORAGE_KEY, JSON.stringify(punchStorage));
    localStorage.setItem(PUNCH_TOKEN_KEY, response.accessToken);

    const loc = user.defaultLocationId || user.locations?.[0]?.locationId || 0;
    if (loc > 0) {
      localStorage.setItem("locationId", String(loc));
      localStorage.setItem("defaultLocationId", String(loc));
    }

    setCookie(
      PUNCH_SESSION_COOKIE,
      encodeURIComponent(JSON.stringify({ ...punchStorage, token: response.accessToken })),
      PUNCH_SESSION_DAYS
    );
  }

  public static clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PUNCH_STORAGE_KEY);
    localStorage.removeItem(PUNCH_TOKEN_KEY);
    localStorage.removeItem(PUNCH_ADMIN_UNLOCK_KEY);
    localStorage.removeItem("locationId");
    localStorage.removeItem("defaultLocationId");
    setCookie(PUNCH_SESSION_COOKIE, "", 0);
  }

  public static getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(PUNCH_TOKEN_KEY);
  }

  public static getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  public static isAuthenticated(): boolean {
    const stored = AuthService.getPunchStorage();
    return Boolean(AuthService.getToken() && stored?.userName && stored.user_UniqueID);
  }

  public static getPunchStorage(): PunchStorage | null {
    try {
      const raw = localStorage.getItem(PUNCH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PunchStorage;
      if (isPunchSessionExpired(parsed)) {
        AuthService.clearSession();
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  public static getStorage(): { tenantID: number; userName: string; userLogin: string; userId: number; user_UniqueID: string } | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

export function isPunchSessionExpired(session: { expiresAt?: number } | null): boolean {
  const expiresAt = Number(session?.expiresAt);
  return !expiresAt || Number.isNaN(expiresAt) || Date.now() > expiresAt;
}

export function setCookie(name: string, value: string, days: number) {
  if (days <= 0) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    return;
  }
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/`;
}

export function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : "";
}
