const PRODUCTION_API = "https://api.v2.cimmple.net/api";

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Private LAN / local Vite hosts (phone testing via PC IP). */
function isLocalDevHost(hostname: string): boolean {
  if (isLoopback(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return false;
}

/** Localhost loopback or same-origin relative /api (Vite proxy only). */
function isDevOnlyApiUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url) || url.startsWith("/");
}

/**
 * Resolve API base.
 * - localhost / LAN IP: always use same-origin `/api` so Vite can proxy to the
 *   local API. Phone browsers cannot reach the PC's `localhost:5172`.
 * - hosted: public API (ignore relative/localhost env leftovers).
 */
function resolveApiRoot(): string {
  const envRoot = import.meta.env.VITE_API_ROOT?.replace(/\/$/, "") || "";
  const hostname = window.location.hostname;

  if (isLocalDevHost(hostname)) {
    // Explicit remote override (e.g. staging) is allowed from local/LAN.
    if (envRoot && !isDevOnlyApiUrl(envRoot)) {
      return envRoot;
    }
    return "/api";
  }

  // Hosted erp.cimmple.net must call the public API host — never /api or localhost.
  if (envRoot && !isDevOnlyApiUrl(envRoot)) {
    return envRoot;
  }

  return PRODUCTION_API;
}

export const API_ROOT = resolveApiRoot();
