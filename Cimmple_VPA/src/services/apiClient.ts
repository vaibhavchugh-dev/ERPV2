import axios from "axios";
import { API_ROOT } from "./apiConfig";
import { AuthService, LoginResponse } from "./authService";

const api = axios.create({
  baseURL: API_ROOT,
});

let refreshPromise: Promise<string | null> | null = null;

const forceRedirectToLogin = () => {
  AuthService.clearSession();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
};

const tryRefreshToken = async (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = AuthService.getRefreshToken();
      if (!refreshToken) return null;
      try {
        const { data } = await axios.post<LoginResponse>(
          `${API_ROOT}/Auth/Refresh`,
          { refreshToken }
        );
        AuthService.persistSession(data, AuthService.getVendorCode());
        return data.accessToken;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

api.interceptors.request.use((config) => {
  const token = AuthService.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const storage = AuthService.getStorage();
  const tenantID = storage?.tenantID || 0;
  const userName = storage?.userLogin || storage?.userName || "";
  const userId = storage?.userId || storage?.user_UniqueID || "";

  config.headers.Username = userName;
  config.headers.tenantId = tenantID;
  config.headers.userId = userId;

  return config;
});

type RetryConfig = { _retry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (typeof error.config & RetryConfig) | undefined;
    const status = error?.response?.status;
    const url = typeof original?.url === "string" ? original.url : "";
    const isAuthEndpoint =
      url.includes("/Auth/VendorLogin") ||
      url.includes("/Auth/Refresh") ||
      url.includes("/Auth/Logout");

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const newToken = await tryRefreshToken();
      if (newToken) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      forceRedirectToLogin();
      return Promise.reject(error);
    }

    if (status === 401 && !isAuthEndpoint) {
      forceRedirectToLogin();
    }

    return Promise.reject(error);
  }
);

export async function vendorLogin(
  vendorCode: string,
  password: string,
  tenantId?: number
): Promise<LoginResponse> {
  const body: { vendorCode: string; password: string; tenantId?: number } = {
    vendorCode,
    password,
  };
  if (tenantId && tenantId > 0) body.tenantId = tenantId;

  const { data } = await api.post<LoginResponse>("/Auth/VendorLogin", body);
  if (!data.user.vendorCode && vendorCode) {
    data.user.vendorCode = vendorCode;
  }
  AuthService.persistSession(data, vendorCode);
  return data;
}

export async function vendorLogout(): Promise<void> {
  try {
    await api.post("/Auth/Logout", {});
  } catch {
    // ignore network errors on logout
  } finally {
    AuthService.clearSession();
  }
}

export default api;
