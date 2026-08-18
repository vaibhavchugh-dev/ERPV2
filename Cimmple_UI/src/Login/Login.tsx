import * as React from "react";
import { Form, Button } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { User } from "../Common/Services/User";
import { AuthService } from "../Common/Services/AuthService";
import { protectedRoutes } from "../Common/Routes";
import { useSettings } from "../Common/Contexts/SettingsContext";
import { toast } from "react-toastify";
import "./Login.scss";

export const Login: React.FC = () => {
  const history = useHistory();
  const { refreshSettings } = useSettings();
  const [userName, setUserName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tenantId, setTenantId] = React.useState("");
  const [showTenant, setShowTenant] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [idleLogOutMessage, setIdleLogOutMessage] = React.useState("");

  React.useEffect(() => {
    User.UnderMaintenance().then((result: any) => {
      if (result?.message === "success" && result?.result === 1) {
        window.location.href = window.location.origin + "/Under-Maintenance";
      }
    });

    if (localStorage.getItem("logOutFromIdlePopUp")) {
      localStorage.removeItem("logOutFromIdlePopUp");
      setIdleLogOutMessage("You have been logged out due to inactivity");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userName.trim() || !password) {
      toast.error("Username and password are required");
      return;
    }

    setIsLoading(true);

    try {
      const parsedTenant = tenantId ? parseInt(tenantId, 10) : undefined;
      const response = await AuthService.login(
        userName.trim(),
        password,
        parsedTenant && !isNaN(parsedTenant) ? parsedTenant : undefined
      );

      User.isAuthenticated = true;
      User.apiLoginResponse = response;

      // Load tenant settings now that a token exists (provider only ran at cold boot).
      void refreshSettings();

      if (response.user.mustChangePassword) {
        toast.info("Please change your password");
        history.push("/change-password");
        return;
      }

      toast.success("Login successful!");
      const landing = AuthService.getDefaultLandingPath(
        protectedRoutes.map((r) => r.path as string)
      );
      history.push(landing);
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Login failed";
      if (typeof message === "string" && message.toLowerCase().includes("tenant")) {
        setShowTenant(true);
      }
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-brand" aria-label="Cimmple brand">
        <div className="login-brand-top">
          <div className="login-brand-mark">
            <img src="/logo.svg" alt="" />
            <span>Cimmple</span>
          </div>
        </div>

        <div className="login-brand-copy">
          <h1>
            Cloud operating system for{" "}
            <em>machine shops</em>
          </h1>
          <p>
            Sign in to CimmpleFlow — manufacturing ERP for quoting, production,
            quality, inventory, and accounting in one place.
          </p>
          <div className="login-brand-pills" aria-hidden="true">
            <span>Quoting</span>
            <span>Production</span>
            <span>Quality</span>
            <span>Inventory</span>
            <span>Accounting</span>
          </div>
        </div>

        <div className="login-brand-foot">
          <span>Built for CNC &amp; job shops</span>
          <a href="https://www.cimmple.com/" target="_blank" rel="noopener noreferrer">
            cimmple.com
          </a>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-panel-inner">
          <div className="login-panel-header">
            <h2>Welcome back</h2>
            <p>Sign in to your Cimmple account</p>
          </div>

          {idleLogOutMessage && (
            <div className="login-idle-message" role="status">
              {idleLogOutMessage}
            </div>
          )}

          <Form className="login-form" onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter username"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                autoComplete="username"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <div className="login-password-wrap">
                <Form.Control
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </Form.Group>
            {(showTenant || tenantId) && (
              <Form.Group className="mb-3">
                <Form.Label>Tenant ID</Form.Label>
                <Form.Control
                  type="number"
                  placeholder="Required if username exists in multiple tenants"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                />
              </Form.Group>
            )}
            <Button
              type="submit"
              className="w-100 login-submit"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </Form>

          <div className="login-footer-link">
            Vendor? <a href="/vendor/login">Open vendor portal</a>
          </div>
        </div>
      </main>
    </div>
  );
};
