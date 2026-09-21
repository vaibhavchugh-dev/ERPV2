const LOCAL_API = "http://localhost:5172/api";
const PRODUCTION_API = "https://api.v2.cimmple.net/api";

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Localhost loopback or same-origin relative /api (Vite proxy only). */
function isDevOnlyApiUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url) || url.startsWith("/");
}

function resolveApiRoot(): string {
  const envRoot = import.meta.env.VITE_API_ROOT?.replace(/\/$/, "") || "";
  const hostname = window.location.hostname;

  if (isLocalHost(hostname)) {
    return envRoot || LOCAL_API;
  }

  // Hosted erp.cimmple.net must call the public API host — never /api or localhost.
  if (envRoot && !isDevOnlyApiUrl(envRoot)) {
    return envRoot;
  }

  return PRODUCTION_API;
}

export const API_ROOT = resolveApiRoot();
