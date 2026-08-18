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
  tenantId: number;
  locationId: number;
  login: (
    username: string,
    password: string,
    tenantId?: number
  ) => Promise<void>;
  logout: () => Promise<void>;
  setLocationId: (id: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    AuthService.isAuthenticated()
  );
  const [userName, setUserName] = useState(AuthService.getUserName());
  const [tenantId, setTenantId] = useState(AuthService.getTenantId());
  const [locationId, setLocationIdState] = useState(
    AuthService.getLocationId()
  );

  const login = useCallback(
    async (username: string, password: string, tenantIdArg?: number) => {
      const response = await apiLogin(username, password, tenantIdArg);
      setIsAuthenticated(true);
      setUserName(
        [response.user.firstName, response.user.lastName]
          .filter(Boolean)
          .join(" ") || response.user.userName
      );
      setTenantId(response.user.tenantId);
      setLocationIdState(AuthService.getLocationId());
    },
    []
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setIsAuthenticated(false);
    setUserName("");
    setTenantId(0);
    setLocationIdState(0);
  }, []);

  const setLocationId = useCallback((id: number) => {
    AuthService.setLocationId(id);
    setLocationIdState(id);
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated,
      userName,
      tenantId,
      locationId,
      login,
      logout,
      setLocationId,
    }),
    [
      isAuthenticated,
      userName,
      tenantId,
      locationId,
      login,
      logout,
      setLocationId,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
