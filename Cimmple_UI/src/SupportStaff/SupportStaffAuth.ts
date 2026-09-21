import Instense from "../Common/Services/Axios-config";

const TOKEN_KEY = "supportToken";
const STORAGE_KEY = "supportStorage";

export interface SupportStaffUser {
  username: string;
  displayName: string;
  portalType: string;
  products: string[];
}

export class SupportStaffAuth {
  static isAuthenticated(): boolean {
    return !!localStorage.getItem(TOKEN_KEY);
  }

  static getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  static getUser(): SupportStaffUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SupportStaffUser;
    } catch {
      return null;
    }
  }

  static clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(STORAGE_KEY);
  }

  static async login(username: string, password: string): Promise<SupportStaffUser> {
    const response = await Instense.post("/SupportStaff/Login", { username, password });
    const token = response.data?.accessToken;
    const user = response.data?.user as SupportStaffUser | undefined;
    if (!token || !user) {
      throw new Error(response.data?.message || "Login failed.");
    }
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...user,
        userLogin: user.username,
        userName: user.displayName || user.username,
        userId: 0,
        tenantID: 0,
      })
    );
    return user;
  }

  static async listTickets(params?: {
    product?: string;
    status?: string;
    q?: string;
    take?: number;
  }) {
    const response = await Instense.get("/SupportStaff/List", { params });
    return Array.isArray(response.data?.result) ? response.data.result : [];
  }

  static async getTicket(id: number) {
    const response = await Instense.get(`/SupportStaff/Get/${id}`);
    return response.data?.result ?? null;
  }

  static async reply(ticketId: number, body: string, status?: string) {
    const response = await Instense.post("/SupportStaff/Reply", {
      ticketId,
      body,
      status,
    });
    return response.data?.result;
  }

  static async updateStatus(ticketId: number, status: string) {
    await Instense.post("/SupportStaff/UpdateStatus", { ticketId, status });
  }

  static async downloadAttachment(ticketId: number): Promise<void> {
    const response = await Instense.get(`/SupportStaff/DownloadAttachment/${ticketId}`, {
      responseType: "blob",
    });
    const blob = response.data as Blob;
    const disposition = response.headers?.["content-disposition"] as string | undefined;
    let fileName = `support-ticket-${ticketId}-attachment`;
    if (disposition) {
      const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(disposition);
      if (match?.[1]) {
        try {
          fileName = decodeURIComponent(match[1].replace(/"/g, "").trim());
        } catch {
          fileName = match[1].replace(/"/g, "").trim();
        }
      }
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  static async getProducts(): Promise<string[]> {
    const response = await Instense.get("/SupportStaff/Products");
    return Array.isArray(response.data?.result) ? response.data.result : ["CimmpleFlow"];
  }
}
