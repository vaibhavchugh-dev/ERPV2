const LOCAL_API = "http://localhost:5172/api";
const PRODUCTION_API = "https://api.v2.cimmple.net/api";

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLocalApiUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

function resolveApiRoot(): string {
  const envRoot = import.meta.env.VITE_API_ROOT?.replace(/\/$/, "") || "";
  const hostname = window.location.hostname;

  if (isLocalHost(hostname)) {
    return envRoot || LOCAL_API;
  }

  // Hosted punch.cimmple.net must never call the developer's machine.
  if (envRoot && !isLocalApiUrl(envRoot)) {
    return envRoot;
  }

  return PRODUCTION_API;
}

export const API_ROOT = resolveApiRoot();
