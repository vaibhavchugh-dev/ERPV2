import Instense from "./Axios-config";

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

const STORAGE_KEY = "storage";
const TOKEN_KEY = "token";
const REFRESH_KEY = "refreshToken";
const PERMS_KEY = "permissions";
const LOCATIONS_KEY = "allowedLocations";

export class AuthService {
  public static persistSession(response: LoginResponse, portal: "erp" | "vendor" = "erp") {
    const user = response.user;
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.userName;

    const storage = {
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
      vendorId: user.vendorId || null,
      vendorCode: user.vendorCode || "",
      portalType: user.portalType || portal,
      sessionTimeoutMinutes: response.sessionTimeoutMinutes,
      expiresAtUtc: response.expiresAtUtc,
    };

    if (portal === "vendor") {
      localStorage.setItem("vendorToken", response.accessToken);
      localStorage.setItem("vendorRefreshToken", response.refreshToken);
      localStorage.setItem("vendorStorage", JSON.stringify(storage));
    } else {
      localStorage.setItem(TOKEN_KEY, response.accessToken);
      localStorage.setItem(REFRESH_KEY, response.refreshToken);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    }

    localStorage.setItem(PERMS_KEY, JSON.stringify(user.permissions || []));
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(user.locations || []));

    const serverDefault =
      user.defaultLocationId ||
      user.locations?.[0]?.locationId ||
      0;
    if (serverDefault > 0) {
      localStorage.setItem("defaultLocationId", String(serverDefault));
    }

    // Preserve an existing working location across token refresh when still allowed.
    // Seed from server default only when missing or no longer in the allowed set.
    // Always clear a stale site left by a previous user (e.g. admin → shopfloor).
    const existingLocationId = Number(localStorage.getItem("locationId") || 0);
    const allowedIds = new Set((user.locations || []).map((l) => l.locationId));
    const existingStillValid =
      existingLocationId > 0 &&
      (user.canAccessAllLocations || allowedIds.has(existingLocationId));

    const workingLocationId = existingStillValid ? existingLocationId : serverDefault;
    if (workingLocationId > 0) {
      localStorage.setItem("locationId", String(workingLocationId));
      // Keep Redux/header in sync (store may still be 0 after login).
      window.dispatchEvent(
        new CustomEvent("locationChanged", {
          detail: { locationId: workingLocationId },
        })
      );
    } else {
      localStorage.removeItem("locationId");
      localStorage.removeItem("defaultLocationId");
      window.dispatchEvent(
        new CustomEvent("locationChanged", {
          detail: { locationId: 0 },
        })
      );
    }
  }

  /** Merge current-user profile fields into localStorage (keeps role/name in sync after Me / role change). */
  public static patchStorageFromUser(user: Partial<AuthUser>) {
    try {
      const storage = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

      if (user.firstName !== undefined || user.lastName !== undefined) {
        const displayName =
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.userName ||
          storage.userLogin ||
          storage.userName ||
          "User";
        storage.userName = displayName;
      } else if (user.userName) {
        storage.userName = storage.userName || user.userName;
      }

      if (user.userName !== undefined) storage.userLogin = user.userName;
      if (user.email !== undefined) storage.email = user.email || "";
      if (user.roleId !== undefined) storage.rolId = user.roleId || 0;
      if (user.roleName !== undefined) storage.role = user.roleName || "";
      if (user.tenantId !== undefined) storage.tenantID = user.tenantId;
      if (user.userId !== undefined) {
        storage.userId = user.userId;
        storage.user_UniqueID = String(user.userId);
      }
      if (user.canAccessAllLocations !== undefined) {
        storage.canAccessAllLocations = user.canAccessAllLocations;
      }
      if (user.defaultLocationId !== undefined) {
        storage.defaultLocationId = user.defaultLocationId || 0;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
      window.dispatchEvent(new CustomEvent("sessionProfileUpdated"));
    } catch {
      // ignore malformed storage
    }
  }

  /** Refresh role/name/email from server into localStorage and return the user. */
  public static async syncCurrentUserProfile(): Promise<AuthUser | null> {
    try {
      const user = await AuthService.me();
      AuthService.patchStorageFromUser(user);
      if (user.permissions) {
        localStorage.setItem(PERMS_KEY, JSON.stringify(user.permissions));
      }
      if (user.locations) {
        localStorage.setItem(LOCATIONS_KEY, JSON.stringify(user.locations));
      }
      return user;
    } catch {
      return null;
    }
  }

  public static clearSession(portal: "erp" | "vendor" | "all" = "all") {
    if (portal === "erp" || portal === "all") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(STORAGE_KEY);
    }
    if (portal === "vendor" || portal === "all") {
      localStorage.removeItem("vendorToken");
      localStorage.removeItem("vendorRefreshToken");
      localStorage.removeItem("vendorStorage");
    }
    if (portal === "all" || portal === "erp") {
      localStorage.removeItem(PERMS_KEY);
      localStorage.removeItem(LOCATIONS_KEY);
      localStorage.removeItem("locationId");
      localStorage.removeItem("defaultLocationId");
    }
  }

  public static getPermissions(): AuthPermission[] {
    try {
      return JSON.parse(localStorage.getItem(PERMS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  public static getAllowedLocations(): AuthLocation[] {
    try {
      return JSON.parse(localStorage.getItem(LOCATIONS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  public static isAdminSession(): boolean {
    try {
      const storage = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (storage?.canAccessAllLocations) return true;
      const role = String(storage?.role || "");
      return /admin/i.test(role);
    } catch {
      return false;
    }
  }

  public static hasPermissionForPath(path: string): boolean {
    // Administrators always see the full app until fine-grained RBAC is fully assigned
    if (AuthService.isAdminSession()) return true;

    const perms = AuthService.getPermissions();
    // No permissions configured for this role → allow (avoid locking users out during rollout)
    if (!perms.length) return true;

    const normalized = path.replace(/\/$/, "") || "/";
    return perms.some((p) => {
      if (!p.url) return false;
      const url = p.url.replace(/\/$/, "") || "/";
      return url === normalized || normalized.startsWith(url + "/");
    });
  }

  /** First permitted app path from candidates (used after login / denied-route redirect). */
  public static getDefaultLandingPath(candidatePaths: string[] = ["/home"]): string {
    for (const path of candidatePaths) {
      if (AuthService.hasPermissionForPath(path)) {
        return path;
      }
    }
    // Role has permissions, but none match known routes — use first permission URL if any
    const firstPermUrl = AuthService.getPermissions().find((p) => !!p.url)?.url;
    return firstPermUrl || candidatePaths[0] || "/home";
  }

  public static async login(username: string, password: string, tenantId?: number): Promise<LoginResponse> {
    const body: any = { username, password };
    if (tenantId && tenantId > 0) body.tenantId = tenantId;
    const { data } = await Instense.post<LoginResponse>("/Auth/Login", body);
    AuthService.persistSession(data, "erp");
    return data;
  }

  public static async vendorLogin(vendorCode: string, password: string, tenantId?: number): Promise<LoginResponse> {
    const body: any = { vendorCode, password };
    if (tenantId && tenantId > 0) body.tenantId = tenantId;
    const { data } = await Instense.post<LoginResponse>("/Auth/VendorLogin", body);
    // Prefer server-returned code; fall back to the code entered at login
    if (!data.user.vendorCode && vendorCode) {
      data.user.vendorCode = vendorCode;
    }
    AuthService.persistSession(data, "vendor");
    return data;
  }

  /** In-flight refresh shared by SessionKeepAlive + Axios 401 interceptor (avoids rotating the same token twice). */
  private static refreshInFlight: Promise<LoginResponse | null> | null = null;

  public static async refresh(): Promise<LoginResponse | null> {
    if (AuthService.refreshInFlight) {
      return AuthService.refreshInFlight;
    }

    AuthService.refreshInFlight = (async () => {
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) return null;
      try {
        const { data } = await Instense.post<LoginResponse>("/Auth/Refresh", { refreshToken });
        AuthService.persistSession(data, "erp");
        return data;
      } catch {
        return null;
      }
    })().finally(() => {
      AuthService.refreshInFlight = null;
    });

    return AuthService.refreshInFlight;
  }

  public static async logout(): Promise<void> {
    try {
      await Instense.post("/Auth/Logout", {});
    } catch {
      // ignore
    } finally {
      AuthService.clearSession("erp");
    }
  }

  public static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await Instense.post("/Auth/ChangePassword", { currentPassword, newPassword });
  }

  public static async setDefaultLocation(locationId: number): Promise<void> {
    await Instense.post("/Auth/SetDefaultLocation", { locationId });

    localStorage.setItem("defaultLocationId", String(locationId));
    try {
      const storage = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      storage.defaultLocationId = locationId;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    } catch {
      // ignore malformed storage
    }
  }

  public static async me(): Promise<AuthUser> {
    const { data } = await Instense.get<AuthUser>("/Auth/Me");
    return data;
  }
}
