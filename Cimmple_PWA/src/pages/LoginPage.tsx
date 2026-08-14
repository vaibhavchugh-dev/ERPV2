import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useForceLightTheme } from "../theme/ThemeContext";

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
      className="relative flex h-dvh max-h-dvh w-full flex-col justify-between overflow-hidden bg-[#070b16] bg-cover bg-center bg-no-repeat px-4 py-4 select-none sm:px-6 sm:py-6"
      style={{ backgroundImage: "url('/login-bg.png')" }}
    >
      {/* Dark Professional Overlay to Maintain Readability */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[#070b16]/85 backdrop-blur-[1px] bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(37,99,235,0.18),transparent_75%)]"
      />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-sm flex-col justify-between">
        
        {/* Top Header & Branding */}
        <div>
          {/* Logo Mark */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#172338] border border-blue-500/30 shadow-md">
              <svg className="h-5 w-5 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Cimmple</span>
          </div>

          {/* Headline */}
          <h1 className="mt-4 text-[2.1rem] font-black leading-[1.05] tracking-tight text-white sm:text-[2.35rem]">
            Cloud operating <br />system for <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300">machine shops</span>
          </h1>

          {/* Subtext */}
          <p className="mt-2.5 text-[0.76rem] font-medium leading-relaxed text-slate-400">
            Sign in to CimmpleFlow — manufacturing ERP for quoting, production, quality, inventory, and accounting in one place.
          </p>

          {/* Pill Badges */}
          <div className="mt-3.5 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#182338] px-3.5 py-1.5 text-[0.7rem] font-semibold text-slate-300 border border-slate-700/50">
              Quoting
            </span>
            <span className="rounded-full bg-[#182338] px-3.5 py-1.5 text-[0.7rem] font-semibold text-slate-300 border border-slate-700/50">
              Production
            </span>
            <span className="rounded-full bg-[#182338] px-3.5 py-1.5 text-[0.7rem] font-semibold text-slate-300 border border-slate-700/50">
              Quality
            </span>
            <span className="rounded-full bg-[#182338] px-3.5 py-1.5 text-[0.7rem] font-semibold text-slate-300 border border-slate-700/50">
              Inventory
            </span>
          </div>
        </div>

        {/* Form Card */}
        <div className="my-auto w-full rounded-2xl border border-slate-800/80 bg-[#182136]/95 p-5 shadow-2xl backdrop-blur-md">
          <h2 className="text-base font-bold text-white">Welcome back</h2>
          <p className="mt-0.5 text-[0.7rem] text-slate-400">
            Sign in to your account and pick up where you left off.
          </p>

          <form className="mt-4" onSubmit={handleSubmit}>
            {error && (
              <div
                className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-[0.72rem] font-medium text-red-200"
                role="alert"
              >
                {error}
              </div>
            )}

            {/* Email / User Name Field */}
            <div className="mb-3">
              <label className="mb-1.5 block text-[0.7rem] font-semibold text-slate-300">
                User
              </label>
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute left-3.5 text-cyan-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  className="w-full rounded-xl border border-slate-700/60 bg-[#0e1424] py-2.5 pl-10 pr-3.5 text-xs text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your user name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="mb-3">
              <label className="mb-1.5 block text-[0.7rem] font-semibold text-slate-300">
                Password
              </label>
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute left-3.5 text-cyan-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  className="w-full rounded-xl border border-slate-700/60 bg-[#0e1424] py-2.5 pl-10 pr-3.5 text-xs text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Conditional Tenant ID Input */}
            {(showTenant || tenantId) && (
              <div className="mb-3">
                <label className="mb-1.5 block text-[0.7rem] font-semibold text-slate-300">
                  Tenant ID
                </label>
                <div className="relative flex items-center">
                  <div className="pointer-events-none absolute left-3.5 text-cyan-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0v-5a2 2 0 012-2h2a2 2 0 012 2v5m-6 0h6" />
                    </svg>
                  </div>
                  <input
                    className="w-full rounded-xl border border-slate-700/60 bg-[#0e1424] py-2.5 pl-10 pr-3.5 text-xs text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                    type="number"
                    inputMode="numeric"
                    placeholder="Required for multi-tenant"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Checkbox and Forgot Password link */}
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

            {/* Submit Button */}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] py-2.5 px-4 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-600 active:scale-[0.99] disabled:opacity-60"
              disabled={loading}
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span>Sign in</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="pt-2 text-center text-[0.68rem] text-slate-400">
          <p className="mt-1 font-medium">
            Need help?{" "}
            <a href="https://www.cimmple.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-400 hover:underline">
              Contact support
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
