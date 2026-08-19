import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { login as apiLogin, logout as apiLogout } from "../services/apiClient";
import { AuthService } from "../services/authService";

interface AuthContextValue {
  isAuthenticated: boolean;
  userName: string;
  login: (username: string, password: string, tenantId?: number) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(AuthService.isAuthenticated());
  const [userName, setUserName] = useState(AuthService.getPunchStorage()?.userName || "");

  const login = useCallback(async (username: string, password: string, tenantIdArg?: number) => {
    const response = await apiLogin(username, password, tenantIdArg);
    if (response.user.portalType === "vendor") {
      AuthService.clearSession();
      throw new Error("Vendor accounts cannot open the time clock.");
    }
    setIsAuthenticated(true);
    setUserName(response.user.userName);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setIsAuthenticated(false);
    setUserName("");
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated, userName, login, logout }),
    [isAuthenticated, userName, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
