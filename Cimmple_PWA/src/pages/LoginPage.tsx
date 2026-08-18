import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useForceLightTheme } from "../theme/ThemeContext";
import "./LoginPage.css";

export function LoginPage() {
  useForceLightTheme();
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [showTenant, setShowTenant] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Username and password are required");
      return;
    }

    setLoading(true);
    try {
      const parsedTenant = tenantId ? parseInt(tenantId, 10) : undefined;
      await login(
        username.trim(),
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
            Cloud operating <br />system for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300">
              machine shops
            </span>
          </h1>

          <p className="pwa-login__lead">
            Sign in to CimmpleFlow — manufacturing ERP for quoting, production, quality, inventory, and accounting in one place.
          </p>

          <div className="pwa-login__chips">
            <span className="pwa-login__chip">Quoting</span>
            <span className="pwa-login__chip">Production</span>
            <span className="pwa-login__chip">Quality</span>
            <span className="pwa-login__chip">Inventory</span>
          </div>
        </div>

        <div className="pwa-login__card">
          <h2 className="pwa-login__card-title">Welcome back</h2>
          <p className="pwa-login__card-sub">
            Sign in to your account and pick up where you left off.
          </p>

          <form className="pwa-login__form" onSubmit={handleSubmit}>
            {error && (
              <div className="pwa-login__error" role="alert">
                {error}
              </div>
            )}

            <div className="pwa-login__field">
              <label className="pwa-login__label">User</label>
              <div className="pwa-login__control">
                <div className="pwa-login__icon">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  className="pwa-login__input"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your user name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="pwa-login__field">
              <label className="pwa-login__label">Password</label>
              <div className="pwa-login__control">
                <div className="pwa-login__icon">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
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
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0v-5a2 2 0 012-2h2a2 2 0 012 2v5m-6 0h6" />
                    </svg>
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

            <div className="my-3 flex items-center justify-between text-[0.72rem]">
              {/* <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-700 bg-[#0e1424] text-blue-600 focus:ring-0 focus:ring-offset-0"
                />
                <span>Remember me</span>
              </label>
              <span className="cursor-pointer font-semibold text-blue-400 hover:text-blue-300">
                Forgot password?
              </span> */}
            </div>

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
