export const API_ROOT =
  import.meta.env.VITE_API_ROOT?.replace(/\/$/, "") || "http://localhost:5172/api"
