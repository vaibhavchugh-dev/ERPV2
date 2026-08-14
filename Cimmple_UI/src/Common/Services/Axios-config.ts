import axios from "axios";
import { API_ROOT } from "./Api-config";
import { AuthService } from "./AuthService";

const Instense = axios.create();

Instense.defaults.baseURL = `${API_ROOT.backendHost}`;

const forceRedirectToLogin = () => {
  try {
    // Do not set idle-logout flag — 401/session expiry is not inactivity
    localStorage.removeItem("logOutFromIdlePopUp");
  } catch {
    // ignore
  }
  try {
    AuthService.clearSession("all");
  } catch {
    // ignore
  }
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
  const path = window.location.pathname || "";
  if (path.startsWith("/vendor")) {
    if (path !== "/vendor/login") {
      window.location.href = "/vendor/login";
    }
  } else if (path !== "/login") {
    window.location.href = "/login";
  }
};

const getBearerToken = () => {
  const path = window.location.pathname || "";
  if (path.startsWith("/vendor")) {
    return localStorage.getItem("vendorToken");
  }
  return localStorage.getItem("token");
};

/** Shares AuthService single-flight refresh with SessionKeepAlive. */
const tryRefreshToken = async (): Promise<string | null> => {
  const refreshed = await AuthService.refresh();
  return refreshed?.accessToken ?? null;
};

Instense.interceptors.request.use((config) => {
  let tenantID = 0;
  let userName = "";
  let userId = "";

  const path = window.location.pathname || "";
  const isVendor = path.startsWith("/vendor");
  const storageRaw = isVendor
    ? localStorage.getItem("vendorStorage")
    : localStorage.getItem("storage");

  const token = getBearerToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (storageRaw) {
    try {
      const storage = JSON.parse(storageRaw);
      if (storage) {
        userName = storage.userLogin || storage.userName || "";
        tenantID = storage.tenantID || 0;
        userId = storage.userId || storage.user_UniqueID || storage.userID || "";
      }
    } catch (e) {
      console.error("Error parsing storage:", e);
    }
  }

  const locationId = localStorage.getItem("locationId");
  if (!isVendor && locationId && locationId !== "0") {
    config.headers["X-Location-Id"] = locationId;
  }

  config.headers.Username = userName;
  config.headers.tenantId = tenantID;
  config.headers.userId = userId;

  return config;
}, (err) => Promise.reject(err));

Instense.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error?.response?.data?.message === "under maintenance") {
      window.location.href = "/Under-Maintenance";
      return Promise.reject(error);
    }

    const status = error?.response?.status;
    const isAuthEndpoint =
      typeof original?.url === "string" &&
      (original.url.includes("/Auth/Login") ||
        original.url.includes("/Auth/VendorLogin") ||
        original.url.includes("/Auth/Refresh") ||
        original.url.includes("/Auth/BootstrapPassword"));

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const newToken = await tryRefreshToken();
      if (newToken) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return Instense(original);
      }
      forceRedirectToLogin();
      return Promise.reject(error);
    }

    if (
      (error.response && error?.response?.data && (error.response.data.session === false || error.response.data.session === "false")) ||
      status === 401
    ) {
      if (!isAuthEndpoint) {
        forceRedirectToLogin();
      }
    }

    return Promise.reject(error);
  }
);

export default Instense;
