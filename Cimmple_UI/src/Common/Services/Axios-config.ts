import axios from "axios";
import { API_ROOT } from "./Api-config";

const Instense = axios.create();

Instense.defaults.baseURL = `${API_ROOT.backendHost}`;

const forceRedirectToLogin = () => {
  try {
    localStorage.clear();
  } catch (err) {
    // ignore localStorage clearing issues
  }
  try {
    sessionStorage.clear();
  } catch (err) {
    // ignore sessionStorage clearing issues
  }
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
};

Instense.interceptors.request.use((config) => {
  // Always try to set tenantId header, even if storage is null
  let tenantID = 0;
  let userName = "";
  let userId = "";
  
  if (localStorage.getItem("token") != null) {
    config.headers.Authorization = `bearer ${localStorage.getItem("token")}`;
  }
  
  if (localStorage.getItem("storage") != null) {
    try {
      let storage = JSON.parse(localStorage.getItem("storage")!);
      if (storage !== null) {
        userName = storage.userName || "";
        tenantID = storage.tenantID || 0;
        userId = storage.userId || storage.user_UniqueID || storage.userID || "";
      }
    } catch (e) {
      console.error("Error parsing storage:", e);
    }
  }
  
  // For development: if tenantID is not set, use a default value
  // Check if we're in development (localhost) or if NODE_ENV is development
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                       window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
  
  if (tenantID === 0 && isDevelopment) {
    tenantID = 1; // Default tenant ID for development
    console.log('[Axios Interceptor] tenantID was 0, defaulting to 1 for development. NODE_ENV:', process.env.NODE_ENV, 'hostname:', window.location.hostname);
  }
  
  // Always set headers (even if empty, so backend can handle it)
  config.headers.Username = userName;
  config.headers.tenantId = tenantID;
  config.headers.userId = userId;
  
  // Debug logging for tenant ID
  if (config.url?.includes('GetShippableItems') || config.url?.includes('GetInvoiceableItems') || config.url?.includes('Shipping') || config.url?.includes('Invoice')) {
    console.log('[Axios Debug] Request headers:', {
      url: config.url,
      tenantId: config.headers.tenantId,
      username: config.headers.Username,
      hasToken: !!localStorage.getItem("token"),
      hasStorage: !!localStorage.getItem("storage")
    });
  }
  
  return config;
}, (err) => {
  console.log(err);
  return Promise.reject(err);
});

Instense.interceptors.response.use((response) => {
  return response;
}, (error) => {
  if (error?.response?.data?.message === "under maintenance") {
    window.location.href = "/Under-Maintenance";
  }
  else if (error.response && error?.response?.data && error?.response?.data?.error &&
    (error.response.data.session === false || error.response.data.session === "false") || (localStorage.getItem("token") === null)) {
    console.error("Session error:", error.response.data.error.message);
    forceRedirectToLogin();
  }
  else if (error?.response && error?.response?.data && error?.response?.data?.error && error?.response?.data?.error?.message) {
    console.error("API error:", error.response.data.error.message);
  }
  else
    if ((error?.response && error?.response?.status === 401) || (localStorage.getItem("token") === null)) {
      console.error("Authentication error:", error.response?.data?.error?.message);
      forceRedirectToLogin();
    } else
      return Promise.reject(error);
});

export default Instense;







