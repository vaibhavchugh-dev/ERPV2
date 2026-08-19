import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "../auth/AuthContext";
import "./PunchLogin.scss";

export function PunchLogin() {
  const { isAuthenticated, login } = useAuth();
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [showTenant, setShowTenant] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!userName.trim() || !password) {
      toast.error("Username and password are required");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const parsedTenant = tenantId ? parseInt(tenantId, 10) : undefined;
      await login(
        userName.trim(),
        password,
        parsedTenant && !Number.isNaN(parsedTenant) ? parsedTenant : undefined
      );
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      const message = ax?.response?.data?.message || ax?.message || "Login failed";
      if (typeof message === "string" && message.toLowerCase().includes("tenant")) {
        setShowTenant(true);
      }
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-brand" aria-label="Cimmple Time Clock">
        <div className="login-brand-top">
          <div className="login-brand-mark">
            <img src="/logo.svg" alt="" />
            <span>Cimmple</span>
          </div>
          <div className="login-brand-product">Time Clock</div>
        </div>

        <div className="login-brand-copy">
          <h1>
            Time Clock for the <em>shop floor</em>
          </h1>
          <p>
            Unlock this kiosk to punch in and out. Use the same Cimmple username
            and password as the main ERP.
          </p>
          <div className="login-brand-pills" aria-hidden="true">
            <span>Punch In</span>
            <span>Punch Out</span>
            <span>Face</span>
            <span>Password</span>
          </div>
        </div>

        <div className="login-brand-foot">
          <span>Shop floor attendance</span>
          <a href="https://www.cimmple.com/" target="_blank" rel="noopener noreferrer">
            cimmple.com
          </a>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-panel-inner">
          <div className="login-panel-header">
            <h2>Unlock Time Clock</h2>
            <p>Supervisor or kiosk sign-in to open the punch board</p>
          </div>

          {errorMessage && (
            <div className="login-idle-message" role="alert">
              {errorMessage}
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label" htmlFor="punch-username">
                Username
              </label>
              <input
                id="punch-username"
                className="form-control"
                type="text"
                placeholder="Enter username"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="punch-password">
                Password
              </label>
              <div className="login-password-wrap">
                <input
                  id="punch-password"
                  className="form-control"
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
            </div>
            {(showTenant || tenantId) && (
              <div className="mb-3">
                <label className="form-label" htmlFor="punch-tenant">
                  Tenant ID
                </label>
                <input
                  id="punch-tenant"
                  className="form-control"
                  type="number"
                  placeholder="Required if username exists in multiple tenants"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                />
              </div>
            )}
            <button type="submit" className="w-100 login-submit" disabled={isLoading}>
              {isLoading ? "Unlocking..." : "Unlock kiosk"}
            </button>
          </form>

          <div className="login-footer-link">Not the ERP — this is Time Clock only</div>
        </div>
      </main>
    </div>
  );
}
