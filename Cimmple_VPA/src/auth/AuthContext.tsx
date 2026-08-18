import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { vendorLogin as apiVendorLogin, vendorLogout } from "../services/apiClient";
import { AuthService } from "../services/authService";

interface AuthContextValue {
  isAuthenticated: boolean;
  userName: string;
  vendorCode: string;
  tenantId: number;
  login: (
    vendorCode: string,
    password: string,
    tenantId?: number
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    AuthService.isAuthenticated()
  );
  const [userName, setUserName] = useState(AuthService.getUserName());
  const [vendorCode, setVendorCode] = useState(AuthService.getVendorCode());
  const [tenantId, setTenantId] = useState(AuthService.getTenantId());

  const login = useCallback(
    async (code: string, password: string, tenantIdArg?: number) => {
      const response = await apiVendorLogin(code, password, tenantIdArg);
      setIsAuthenticated(true);
      setUserName(
        [response.user.firstName, response.user.lastName]
          .filter(Boolean)
          .join(" ") || response.user.userName
      );
      setVendorCode(response.user.vendorCode || code);
      setTenantId(response.user.tenantId);
    },
    []
  );

  const logout = useCallback(async () => {
    await vendorLogout();
    setIsAuthenticated(false);
    setUserName("");
    setVendorCode("");
    setTenantId(0);
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated,
      userName,
      vendorCode,
      tenantId,
      login,
      logout,
    }),
    [isAuthenticated, userName, vendorCode, tenantId, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
