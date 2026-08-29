const PROD_API = "https://api.v2.cimmple.net/api";
const LOCAL_API = "http://localhost:5172/api";

function defaultApiRoot(): string {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  if (hostname.includes("localhost") || hostname === "127.0.0.1") {
    return LOCAL_API;
  }
  return PROD_API;
}

export const API_ROOT =
  import.meta.env.VITE_API_ROOT?.replace(/\/$/, "") || defaultApiRoot();
