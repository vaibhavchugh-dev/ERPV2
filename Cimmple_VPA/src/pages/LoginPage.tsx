import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { IconBuilding, IconLock, IconVendorBadge } from "../components/Icons";
import { useForceLightTheme } from "../theme/ThemeContext";
import "./LoginPage.css";

export function LoginPage() {
  useForceLightTheme();
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [vendorCode, setVendorCode] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [showTenant, setShowTenant] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!vendorCode.trim() || !password) {
      setError("Vendor code and password are required");
      return;
    }

    setLoading(true);
    try {
      const parsedTenant = tenantId ? parseInt(tenantId, 10) : undefined;
      await login(
        vendorCode.trim(),
        password,
        parsedTenant && !Number.isNaN(parsedTenant) ? parsedTenant : undefined
      );
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      const message = ax?.response?.data?.message || ax?.message || "Login failed";
      if (typeof message === "string" && message.toLowerCase().includes("tenant")) {
        setShowTenant(true);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="pwa-login"
      style={{ backgroundImage: "url('/login-bg.png')" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[#070b16]/85 backdrop-blur-[1px] bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(37,99,235,0.18),transparent_75%)]"
      />

      <div className="pwa-login__inner">
        <div className="pwa-login__brand">
          <div className="pwa-login__logo-row">
            <div className="pwa-login__logo-mark">
              <svg className="text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
              </svg>
            </div>
            <span className="pwa-login__brand-name">Cimmple</span>
          </div>

          <h1 className="pwa-login__title">
            Vendor portal for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300">
              quotations
            </span>
          </h1>

          <p className="pwa-login__lead">
            Review RFQs, submit pricing, and collaborate with machine shops running on CimmpleFlow.
          </p>

          <div className="pwa-login__chips">
            <span className="pwa-login__chip">RFQs</span>
            <span className="pwa-login__chip">Quotes</span>
            <span className="pwa-login__chip">Responses</span>
          </div>
        </div>

        <div className="pwa-login__card">
          <h2 className="pwa-login__card-title">Vendor sign in</h2>
          <p className="pwa-login__card-sub">
            Use your vendor code and portal password
          </p>

          <form className="pwa-login__form" onSubmit={handleSubmit}>
            {error && (
              <div className="pwa-login__error" role="alert">
                {error}
              </div>
            )}

            <div className="pwa-login__field">
              <label className="pwa-login__label">Vendor code</label>
              <div className="pwa-login__control">
                <div className="pwa-login__icon">
                  <IconVendorBadge size={20} />
                </div>
                <input
                  className="pwa-login__input"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your vendor code"
                  value={vendorCode}
                  onChange={(e) => setVendorCode(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="pwa-login__field">
              <label className="pwa-login__label">Password</label>
              <div className="pwa-login__control">
                <div className="pwa-login__icon">
                  <IconLock size={20} />
                </div>
                <input
                  className="pwa-login__input pwa-login__input--password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="pwa-login__eye"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? (
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {(showTenant || tenantId) && (
              <div className="pwa-login__field">
                <label className="pwa-login__label">Tenant ID</label>
                <div className="pwa-login__control">
                  <div className="pwa-login__icon">
                    <IconBuilding size={20} />
                  </div>
                  <input
                    className="pwa-login__input"
                    type="number"
                    inputMode="numeric"
                    placeholder="Required for multi-tenant"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="pwa-login__submit"
              disabled={loading}
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span>Sign in</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="pwa-login__footer">
          <p className="mt-1 font-medium">
            Need help?{" "}
            <a href="https://www.cimmple.com/" target="_blank" rel="noopener noreferrer">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
