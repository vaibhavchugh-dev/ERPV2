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
  vendorName?: string;
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
/** Last user activity in any tab (ms epoch); tabs share one session, so idle is judged across all of them. */
export const LAST_ACTIVITY_KEY = "lastActivityAt";
export const MIN_SESSION_TIMEOUT_MINUTES = 5;
export const MAX_SESSION_TIMEOUT_MINUTES = 480;
export const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;

/**
 * - none: no ERP session stored
 * - idle: longer than Session Timeout since the last activity in any tab
 * - expired: access token past expiry, but not idle (a refresh may restore it)
 */
export type StoredSessionState = "none" | "valid" | "idle" | "expired";

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
      vendorName: user.vendorName || "",
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
        window.dispatchEvent(new CustomEvent("allowedLocationsUpdated"));
      }
      return user;
    } catch {
      return null;
    }
  }

  /** Re-sync allowed locations from /me and notify TopBar / site filters to reload. */
  public static async refreshAllowedLocations(): Promise<AuthLocation[]> {
    const user = await AuthService.syncCurrentUserProfile();
    return user?.locations ?? AuthService.getAllowedLocations();
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

  public static markActivity() {
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }

  /** Judged from localStorage alone so it can run before any protected UI renders. */
  public static getStoredSessionState(): StoredSessionState {
    if (!localStorage.getItem(TOKEN_KEY)) return "none";

    let storage: { sessionTimeoutMinutes?: number; expiresAtUtc?: string } = {};
    try {
      storage = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      // ignore malformed storage
    }

    const timeoutMinutes = Math.max(
      MIN_SESSION_TIMEOUT_MINUTES,
      Math.min(
        MAX_SESSION_TIMEOUT_MINUTES,
        Number(storage.sessionTimeoutMinutes) || DEFAULT_SESSION_TIMEOUT_MINUTES
      )
    );
    const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || 0;
    if (lastActivity > 0 && Date.now() - lastActivity >= timeoutMinutes * 60 * 1000) {
      return "idle";
    }

    const expiresAtMs = storage.expiresAtUtc ? Date.parse(storage.expiresAtUtc) : NaN;
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      return "expired";
    }

    return "valid";
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

  /** Paths allowed when a non-admin role has no permissions assigned (deny-by-default). */
  private static readonly EMPTY_PERM_ALLOWED_PATHS = new Set(["/home", "/"]);

  /**
   * Level-2 actions per page. Mirrors ErpPermissionActions.PageActions so the UI
   * hides actions the API would reject when a page grant has no action grants.
   */
  private static readonly PAGE_ACTION_CATALOG: Record<string, string[]> = {
    "/home": [],
    "/workflow": [],
    "/quotations/customer": ["Add", "Edit", "Delete", "Convert", "Send", "Print", "Duplicate"],
    "/orders/customer": ["Add", "Edit", "Delete", "Ship", "Invoice", "Send", "Print", "Duplicate", "CreateJob"],
    "/orders/customer-shipments": ["Print", "Send", "Delete"],
    "/orders/customer-invoices": ["Pay", "Print", "Send", "Void"],
    "/job-orders": ["Edit", "Delete", "Complete", "Print", "Send", "Manage"],
    "/quotations/vendor": ["Add", "Edit", "Delete", "Convert", "Compare", "Send", "Print", "Duplicate"],
    "/purchasing/vendor-orders": ["Add", "Edit", "Delete", "Send", "Print", "Duplicate", "Invoice"],
    "/purchasing/vendor-receiving": ["Receive"],
    "/purchasing/vendor-invoices": ["Add", "Approve", "Pay", "Print", "Send", "Void", "Delete"],
    "/inventory": ["Receive", "Issue", "Reserve", "Transfer", "Adjust"],
    "/quality": ["Add", "Edit", "Delete", "Print", "Send"],
    "/quality/ncr-codes": ["Add", "Edit", "Delete"],
    "/reports": ["Export", "Schedule"],
    "/reports/schedules": ["Edit", "Delete", "Send", "Manage"],
    "/documents": ["Upload", "Download", "Delete", "Manage"],
    "/accounts/dashboard": [],
    "/accounts/payable": ["Approve", "Pay", "Void"],
    "/accounts/receivable": ["Pay", "Send"],
    "/accounts/banks": ["Reconcile", "Import", "Export", "Close", "Delete"],
    "/accounts/reports": ["Export", "Schedule"],
    "/accounts/setup": ["Edit"],
    "/accounts/journal-entries": ["Add", "Post", "Delete", "Reverse"],
    "/accounts/payroll": ["Add", "Import", "Post", "Pay"],
    "/accounts/general-ledger": [],
    "/accounts/periods": ["Close", "Reopen"],
    "/masters/bank": ["Add", "Edit", "Delete"],
    "/masters/creditcard": ["Add", "Edit", "Delete"],
    "/masters/chartofaccounts": ["Add", "Edit", "Delete"],
    "/masters/customer": ["Add", "Edit", "Delete", "Import"],
    "/masters/vendor": ["Add", "Edit", "Delete", "Import"],
    "/masters/workstation": ["Add", "Edit", "Delete", "Import"],
    "/masters/employee": ["Add", "Edit", "Delete", "Import"],
    "/masters/location": ["Add", "Edit", "Delete"],
    "/masters/process": ["Add", "Edit", "Delete", "Import"],
    "/masters/jobtemplate": ["Add", "Edit", "Delete", "Export"],
    "/masters/category": ["Add", "Edit", "Delete", "Seed"],
    "/masters/pricebreakdown": ["Add", "Edit", "Delete"],
    "/masters/product": ["Edit", "Sync"],
    "/masters/raw-material": ["Add", "Edit"],
    "/attendance": ["Export"],
    "/user-management": [],
    "/settings": ["Edit", "Send"],
  };

  public static hasPermissionForPath(path: string): boolean {
    // Administrators always see the full app until fine-grained RBAC is fully assigned
    if (AuthService.isAdminSession()) return true;

    const normalized = path.replace(/\/$/, "") || "/";
    const perms = AuthService.getPermissions();

    // No permissions assigned → deny all modules; Dashboard only
    if (!perms.length) {
      return AuthService.EMPTY_PERM_ALLOWED_PATHS.has(normalized);
    }

    // Exact URL match only so sibling routes (e.g. /quality vs /quality/ncr-codes) stay independent
    return perms.some((p) => {
      if (!p.url) return false;
      const url = p.url.replace(/\/$/, "") || "/";
      return url === normalized;
    });
  }

  /** User Management (and its action URLs) cannot be granted to non-admin roles. */
  public static isAdminOnlyPath(url?: string): boolean {
    return AuthService.normalizePageUrl(url) === "/user-management";
  }

  /**
   * Level-2 check for a page path. Admins always pass.
   * If the role has any action grants on the page, only those actions pass.
   * If the page has a known action catalog and none are granted, only View passes.
   */
  public static hasActionPermission(pagePath: string, action: string): boolean {
    if (AuthService.isAdminSession()) return true;

    const page = AuthService.normalizePageUrl(pagePath);
    const urls = AuthService.getPermissions().map((p) =>
      AuthService.normalizePermissionUrl(p.url)
    );
    if (urls.indexOf(page) < 0) return false;

    const normalizedAction = (action || "").trim().toLowerCase();
    if (!normalizedAction || normalizedAction === "view") return true;

    const prefix = `${page}#`;
    const wanted = `${prefix}${normalizedAction}`;
    let hasAnyAction = false;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (url.indexOf(prefix) !== 0) continue;
      hasAnyAction = true;
      if (url === wanted) return true;
    }
    if (hasAnyAction) return false;

    const catalog = AuthService.PAGE_ACTION_CATALOG[page];
    if (catalog && catalog.length > 0) return false;
    return true;
  }

  private static normalizePageUrl(url?: string): string {
    let u = (url ?? "").trim();
    const hash = u.indexOf("#");
    if (hash >= 0) u = u.slice(0, hash);
    if (u.length === 0) return "/";
    if (!u.startsWith("/")) u = "/" + u;
    u = u.replace(/\/+$/, "");
    return (u.length === 0 ? "/" : u).toLowerCase();
  }

  private static normalizePermissionUrl(url?: string): string {
    const raw = (url ?? "").trim();
    if (raw.length === 0) return "/";
    const hash = raw.indexOf("#");
    if (hash < 0) return AuthService.normalizePageUrl(raw);
    const page = AuthService.normalizePageUrl(raw.slice(0, hash));
    const action = raw.slice(hash + 1).trim();
    if (action.length === 0) return page;
    return `${page}#${action.toLowerCase()}`;
  }

  /** First permitted app path from candidates (used after login / denied-route redirect). */
  public static getDefaultLandingPath(candidatePaths: string[] = ["/home"]): string {
    for (const path of candidatePaths) {
      if (AuthService.hasPermissionForPath(path)) {
        return path;
      }
    }
    // Empty permissions → land on dashboard
    if (!AuthService.getPermissions().length) {
      return "/home";
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
    // Not in persistSession: background token refreshes must not reset the idle clock.
    AuthService.markActivity();
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
  private static refreshInFlight: Promise<Pick<LoginResponse, "accessToken"> | null> | null = null;

  public static async refresh(): Promise<Pick<LoginResponse, "accessToken"> | null> {
    if (AuthService.refreshInFlight) {
      return AuthService.refreshInFlight;
    }

    AuthService.refreshInFlight = AuthService.refreshAcrossTabs().finally(() => {
      AuthService.refreshInFlight = null;
    });

    return AuthService.refreshInFlight;
  }

  /**
   * Refresh tokens rotate on every use and are shared by all tabs through localStorage, so
   * refreshes are serialized across tabs with a Web Lock. A tab that finds the token already
   * rotated by another tab reuses that tab's new session instead of sending the stale token.
   */
  private static async refreshAcrossTabs(): Promise<Pick<LoginResponse, "accessToken"> | null> {
    const isVendor = (window.location.pathname || "").startsWith("/vendor");
    const refreshKey = isVendor ? "vendorRefreshToken" : REFRESH_KEY;
    const tokenKey = isVendor ? "vendorToken" : TOKEN_KEY;
    const tokenAtStart = localStorage.getItem(refreshKey);
    if (!tokenAtStart) return null;

    const run = async (): Promise<Pick<LoginResponse, "accessToken"> | null> => {
      const current = localStorage.getItem(refreshKey);
      if (!current) return null;
      if (current !== tokenAtStart) {
        const accessToken = localStorage.getItem(tokenKey);
        return accessToken ? { accessToken } : null;
      }
      try {
        const { data } = await Instense.post<LoginResponse>("/Auth/Refresh", { refreshToken: current });
        AuthService.persistSession(data, isVendor ? "vendor" : "erp");
        return data;
      } catch (err: any) {
        if (err?.response?.status === 401) {
          return AuthService.awaitRotationByOtherTab(refreshKey, tokenKey, current);
        }
        return null;
      }
    };

    const locks = (navigator as any).locks;
    if (locks?.request) {
      return locks.request(`cimmple-auth-refresh-${isVendor ? "vendor" : "erp"}`, run);
    }
    return run();
  }

  /**
   * A 401 on refresh can mean another tab rotated the token first: localStorage writes from
   * other tabs reach this tab asynchronously, so the lock alone does not guarantee a fresh read.
   */
  private static async awaitRotationByOtherTab(
    refreshKey: string,
    tokenKey: string,
    sentToken: string
  ): Promise<Pick<LoginResponse, "accessToken"> | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const latest = localStorage.getItem(refreshKey);
      if (!latest) return null;
      if (latest !== sentToken) {
        const accessToken = localStorage.getItem(tokenKey);
        return accessToken ? { accessToken } : null;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return null;
  }

  /** Ends the current session on the server (works even when the access token has expired). */
  public static async revokeSession(portal: "erp" | "vendor" = "erp"): Promise<void> {
    const refreshToken = localStorage.getItem(portal === "vendor" ? "vendorRefreshToken" : REFRESH_KEY);
    if (!refreshToken) return;
    try {
      await Instense.post("/Auth/RevokeSession", { refreshToken });
    } catch {
      // ignore
    }
  }

  public static async logout(): Promise<void> {
    try {
      await AuthService.revokeSession("erp");
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
